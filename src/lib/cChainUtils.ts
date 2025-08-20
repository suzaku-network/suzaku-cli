import cliProgress from 'cli-progress';
import { decodeEventLog, decodeAbiParameters, Hex, Abi, Block } from 'viem';
import { ExtendedPublicClient } from '../client';
import { TContract } from '../config';

type CommonEvent = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string | number | bigint;
  blockHash: string;
  transactionHash: string;
  transactionIndex: string | number;
  timeStamp?: string | number;
  logIndex: string | number;
  eventName?: string;
  args?: Record<string, any>;
};

export type DecodedEvent = {
  blockNumber: bigint;
  transactionHash: Hex;
  eventName: string;
  args: Record<string, any>;
  address: string;
  timestamp: number;
}

// TODO: optimize eventNames filtering it from apis
export async function GetContractEvents(
  client: ExtendedPublicClient,
  address: Hex,
  fromBlock: number,
  toBlock: number,
  abi: Abi,
  eventNames?: string[],
  snowscanApiKey?: string,
  forceTimestamp: boolean = true,
  bar?: cliProgress.SingleBar
): Promise<DecodedEvent[]> {
  let events: CommonEvent[] = [];
  try {
    if (snowscanApiKey) {
      // Fetch logs from Snowscan API (transactions are not decoded)
      const url = `https://api${client.network === 'fuji' ? '-testnet' : ''}.snowscan.xyz/api`;
      const urlParams = new URLSearchParams({
        module: 'logs',
        action: 'getLogs',
        address,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        apikey: snowscanApiKey
      });

      const res = await fetch(`${url}?${urlParams}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { status: string, message: string, result: any[] };
      events = data.result
        .reduce((acc: [], log) =>
          [Object.assign(log, decodeEventLog({
            abi,
            data: log.data,
            topics: log.topics,
          })), ...acc]
          , []
        )
    } else {
      // Fetch logs using viem client
      toBlock = toBlock - 2 // to avoid reading the current block, which may not be finalized yet

      const blockToScan = toBlock - fromBlock;
      if (!bar) {
        bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        bar.start(blockToScan, 0);
      } else {
        bar.setTotal(bar.getTotal() + blockToScan);
      }
      for (let i = fromBlock; i <= toBlock; i += 2000) {

        let toSub = i + 2000 > toBlock ? toBlock : i + 2000;
        events.push(...await client.getContractEvents({
          address: address,
          abi: abi,
          fromBlock: BigInt(i),
          toBlock: BigInt(toSub)
        }))
        bar.increment(2000);
      }
      bar.increment(blockToScan - (toBlock - fromBlock));
      if (bar.getProgress() === 1) bar.stop();
    }
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error(error.message);
    }
  }

  // Filter and format events
  const result = events.filter((log: CommonEvent) => eventNames ? eventNames.includes(log.eventName!) : true)
    .map(log => {
      return {
        blockNumber: typeof (log.blockNumber) === 'bigint' ? log.blockNumber : BigInt(log.blockNumber),
        transactionHash: log.transactionHash,
        eventName: log.eventName,
        args: log.args,
        address: log.address,
        timestamp: Number(log.timeStamp!)
      } as DecodedEvent
    });
  return forceTimestamp ? snowscanApiKey ? result : PatchEventsTimestamp(client, result) : result;
}

export async function PatchEventsTimestamp(
  client: ExtendedPublicClient,
  events: DecodedEvent[],
): Promise<DecodedEvent[]> {
  const blockTimstamps = (await Promise.all([...new Set(events.map(event => event.blockNumber))]
    .map((blockNumber: bigint) =>
      client.getBlock({
        blockNumber,
        includeTransactions: false,
      })))
  )
    .reduce((acc, block) => {
      acc[Number(block.number)] = Number(block.timestamp);
      return acc;
    }, {} as Record<number, number>);

  return events.map(event => ({
    ...event,
    timestamp: event.timestamp || blockTimstamps[Number(event.blockNumber)],
  }));
}

export async function fillEventsNodeId(
  balancer: TContract['BalancerValidatorManager'],
  events: DecodedEvent[],
): Promise<DecodedEvent[]> {

  let validationIdMap: Record<string, string> = {};

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const validationId = event.args.validationID as Hex | undefined;
    const nodeId = event.args.nodeId;
    if (nodeId && validationId) {
      validationIdMap[validationId] = nodeId;
    } else if (!nodeId && validationId && validationIdMap[validationId]) {
      event.args.nodeId = validationIdMap[validationId];
    } else if (!nodeId && validationId && !validationIdMap[validationId]) {
      event.args.nodeId = (await balancer.read.getValidator([validationId])).nodeID;
      validationIdMap[event.args.validationId] = event.args.nodeId;
    }
    events[i] = event;
  };

  return events;
}
