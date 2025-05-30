import cliProgress from 'cli-progress';
import { decodeEventLog, decodeAbiParameters, Hex, Abi } from 'viem';
import { ExtendedPublicClient } from '../client';

type CommonEvent = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string | number | bigint;
  blockHash: string;
  transactionHash: string;
  transactionIndex: string | number;
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
      const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

      toBlock = toBlock - 2 // to avoid reading the current block, which may not be finalized yet

      const blockToScan = toBlock - fromBlock;
      bar.start(Number(blockToScan), 0);

      for (let i = fromBlock; i <= toBlock; i += 2000) {

        let toSub = i + 2000 > toBlock ? toBlock : i + 2000;
        events.push(...await client.getContractEvents({
          address: address,
          abi: abi,
          fromBlock: BigInt(i),
          toBlock: BigInt(toSub)
        }))
        bar.update(blockToScan + i - toBlock);
      }
      bar.stop();
    }
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }

  // Filter and format events
  return events.filter((log: CommonEvent) => {
    if (eventNames) {
      return eventNames.includes(log.eventName!);
    }
    return true;
  }).map(log => {
    return {
      blockNumber: typeof (log.blockNumber) === 'bigint' ? log.blockNumber : BigInt(log.blockNumber),
      transactionHash: log.transactionHash,
      eventName: log.eventName,
      args: log.args,
      address: log.address
    } as DecodedEvent
  });
}

