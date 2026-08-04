import { SingleBar, Presets } from 'cli-progress';
import { decodeEventLog, Hex, Abi } from 'viem';
import { ExtendedClient, ExtendedPublicClient } from '../client';
import { SafeSuzakuContract, SuzakuContract } from './viemUtils';
import { logger } from './logger';

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

const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api';
const EXPLORER_PAGE_SIZE = 1000;
const EXPLORER_MAX_PAGES = 100;

const AVALANCHE_EXPLORER_CHAIN_IDS = new Set([43114, 43113]);

function sanitizeExplorerText(apiKey: string, value: unknown): string {
  const text = String(value ?? '');
  return (apiKey ? text.replaceAll(apiKey, '[REDACTED]') : text).slice(0, 200);
}

async function fetchExplorerLogs(
  client: ExtendedClient,
  address: Hex,
  fromBlock: number,
  toBlock: number,
  apiKey: string,
  chainId: number,
): Promise<CommonEvent[]> {
  const events: CommonEvent[] = [];

  for (let page = 1; page <= EXPLORER_MAX_PAGES; page++) {
    const url = new URL(ETHERSCAN_V2_API);
    url.search = new URLSearchParams({
      chainid: chainId.toString(),
      module: 'logs',
      action: 'getLogs',
      address,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      page: page.toString(),
      offset: EXPLORER_PAGE_SIZE.toString(),
      apikey: apiKey,
    }).toString();

    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      // Do not include the URL: its query string contains the credential.
      throw new Error('Explorer API request failed');
    }
    if (!res.ok) throw new Error(`Explorer API HTTP ${res.status}`);

    let data: { status?: string; message?: string; result?: unknown };
    try {
      data = await res.json() as typeof data;
    } catch {
      throw new Error('Explorer API returned invalid JSON');
    }
    if (!Array.isArray(data.result)) {
      const detail = typeof data.result === 'string'
        ? `: ${sanitizeExplorerText(apiKey, data.result)}`
        : '';
      throw new Error(`Explorer API ${sanitizeExplorerText(apiKey, data.message) || 'error'}${detail}`);
    }
    // Etherscan represents a valid empty scan as status=0/message="No records
    // found". Other status=0 responses (including NOTOK + []) are failures.
    const canonicalNoRecords = data.status === '0'
      && data.result.length === 0
      && /no (records|logs|transactions) found/i.test(String(data.message ?? ''));
    if (data.status !== '1' && !canonicalNoRecords) {
      const resultDetail = data.result.length > 0
        ? `: ${sanitizeExplorerText(apiKey, data.result)}`
        : '';
      throw new Error(`Explorer API ${sanitizeExplorerText(apiKey, data.message) || 'error'}${resultDetail}`);
    }

    events.push(...data.result as CommonEvent[]);
    if (data.result.length < EXPLORER_PAGE_SIZE) return events;
  }

  throw new Error(`Explorer API pagination exceeded ${EXPLORER_MAX_PAGES} pages`);
}

export type DecodedEvent = {
  blockNumber: bigint;
  transactionHash: Hex;
  eventName: string;
  args: Record<string, any>;
  address: string;
  timestamp: number;
}

export async function getChainId(rpcUrl: string): Promise<number> {
  const ret = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_chainId",
      params: [],
      id: 1,
    }),
  });
  const data = await ret.json();
  return data.result;
}

// TODO: optimize eventNames filtering it from apis
export async function GetContractEvents(
  client: ExtendedClient,
  address: Hex,
  fromBlock: number,
  toBlock: number,
  abi: Abi,
  eventNames?: string[],
  snowscanApiKey?: string,
  forceTimestamp: boolean = true,
  bar?: SingleBar
): Promise<DecodedEvent[]> {
  let events: CommonEvent[] = [];
  try {
    // Use the RPC-reported chain id rather than the coarse mainnet/fuji label:
    // Kite and custom chains deliberately share those labels.
    const runtimeChainId = snowscanApiKey ? await client.getChainId() : undefined;
    if (snowscanApiKey && runtimeChainId !== undefined && AVALANCHE_EXPLORER_CHAIN_IDS.has(runtimeChainId)) {
      // SnowScan V1 was retired in 2026. Keep the public parameter name for CLI
      // compatibility, but use Etherscan V2 with the Avalanche chain id. Avalanche
      // requires a paid Etherscan API tier; provider errors must fail the scan.
      events = (await fetchExplorerLogs(client, address, fromBlock, toBlock, snowscanApiKey, runtimeChainId))
        .reduce((acc: CommonEvent[], log) => {
          try {
            return [Object.assign(log, decodeEventLog({
              abi,
              data: log.data as Hex,
              topics: log.topics as [Hex, ...Hex[]],
            })), ...acc];
          } catch {
            // log emitted by the contract but absent from the provided ABI (e.g. proxy events)
            return acc;
          }
        }, [])
    } else {
      // Fetch logs using viem client
      const blockToScan = toBlock - fromBlock;
      if (!bar) {
        bar = new SingleBar({}, Presets.shades_classic);
        bar.start(blockToScan, 0);
      } else {
        bar.setTotal(bar.getTotal() + blockToScan);
      }
      for (let i = fromBlock; i <= toBlock; i += 2000) {

        const toSub = i + 1999 > toBlock ? toBlock : i + 1999;
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
    logger.error("Read contract failed:", error);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    throw error;
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
  return forceTimestamp ? PatchEventsTimestamp(client, result) : result;
}

/** Resolve an inclusive scan end without altering explicit or epoch-derived bounds. */
export function resolveEventScanEnd(
  latestBlock: bigint,
  explicitToBlock?: bigint,
  epochDerivedToBlock?: bigint,
): bigint {
  if (explicitToBlock !== undefined) return explicitToBlock;
  if (epochDerivedToBlock !== undefined) return epochDerivedToBlock;
  return latestBlock > 2n ? latestBlock - 2n : 0n;
}

/** Latest block safe for an open-ended scan. */
export async function getFinalizedBlockNumber(client: ExtendedClient): Promise<bigint> {
  return resolveEventScanEnd(await client.getBlockNumber());
}

export async function PatchEventsTimestamp(
  client: ExtendedClient,
  events: DecodedEvent[],
): Promise<DecodedEvent[]> {
  const needsTimestamp = events.filter((event) => !Number.isFinite(event.timestamp) || event.timestamp <= 0);
  if (needsTimestamp.length === 0) return events;

  const blockTimstamps = (await Promise.all([...new Set(needsTimestamp.map(event => event.blockNumber))]
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
    timestamp: Number.isFinite(event.timestamp) && event.timestamp > 0
      ? event.timestamp
      : blockTimstamps[Number(event.blockNumber)],
  }));
}

export async function fillEventsNodeId(
  balancer: SuzakuContract['BalancerValidatorManager'],
  events: DecodedEvent[],
): Promise<DecodedEvent[]> {

  const validationIdMap: Record<string, string> = {};

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

/**
 * @title BlockAtTimestampFast
 * @notice Returns the block number closest to a given UNIX timestamp.
 * @param client  viem PublicClient (RPC)
 * @param ts      Target UNIX timestamp (in seconds, BigInt)
 * @param mode    "lte" → greatest block with timestamp ≤ ts; "gte" → smallest block with timestamp ≥ ts
 * @param recentWindow  Number of recent blocks to compute the local average (default: 10_000n)
 * @return Block number as BigInt that satisfies the chosen mode.
 */
export async function blockAtTimestamp(
  client: ExtendedClient,
  ts: bigint,
  mode: "lte" | "gte" = "lte",
  recentWindow: bigint = 10_000_0n
): Promise<bigint> {
  const cache = new Map<bigint, bigint>();
  const getTS = async (n: bigint) => {
    const v = cache.get(n);
    if (v !== undefined) return v;
    const b = await client.getBlock({ blockNumber: n });
    cache.set(n, b.timestamp);
    return b.timestamp;
  };

  const latestN = await client.getBlockNumber();
  const [latestTs, genesisTs] = await Promise.all([getTS(latestN), getTS(0n)]);

  if (ts <= genesisTs) return 0n;
  if (ts >= latestTs) return latestN;

  // --- Local average over a recent window (seed estimate near 'ts') ---
  const b0 = latestN > recentWindow ? latestN - recentWindow : 0n;
  const [t0, t1] = await Promise.all([getTS(b0), getTS(latestN)]);
  const avgRecent = Number(t1 - t0) / Math.max(1, Number(latestN - b0)) || 12; // sec/block fallback

  let est = latestN - BigInt(Math.floor(Number(latestTs - ts) / Math.max(1e-6, avgRecent)));
  if (est < 0n) est = 0n;
  if (est > latestN) est = latestN;

  // --- Exponential bracketing around 'est' ---
  let lo = 0n, hi = 0n, loTs = 0n, hiTs = 0n;
  const estTs = await getTS(est);

  if (estTs <= ts) {
    lo = est; loTs = estTs;
    let step = 1n;
    while (true) {
      const next = est + step;
      hi = next > latestN ? latestN : next;
      hiTs = await getTS(hi);
      if (hiTs > ts || hi === latestN) break;
      step <<= 1n; // double the step
    }
  } else {
    hi = est; hiTs = estTs;
    let step = 1n;
    while (true) {
      const next = est > step ? est - step : 0n;
      lo = next;
      loTs = await getTS(lo);
      if (loTs <= ts || lo === 0n) break;
      step <<= 1n; // double the step
    }
  }

  // --- Interpolation search (fallback to binary when needed) ---
  while (lo + 1n < hi) {
    const denom = hiTs - loTs;
    let mid = denom > 0n ? lo + ((ts - loTs) * (hi - lo)) / denom : (lo + hi) >> 1n;
    if (mid <= lo) mid = lo + 1n;
    else if (mid >= hi) mid = hi - 1n;

    const midTs = await getTS(mid);
    if (midTs <= ts) { lo = mid; loTs = midTs; }
    else { hi = mid; hiTs = midTs; }
  }

  return mode === "lte" ? lo : hi;
}

type FetchOpts = { fromBlock: bigint; toBlock: bigint };
type Fetcher<T> = (opts: FetchOpts) => Promise<T[]>;

/**
 * Collect events in [fromBlock, toBlock] by chunks.
 * @param fromBlock  inclusive "asc" (oldest→newest) if fromBlock < toBlock, otherwise "desc" (newest→oldest).
 * @param toBlock    inclusive
 * @param count      -1 = all (default). If >0, stops after collecting `count` events.
 * @param fetcher    e.g. (opts) => middlewareSvc.getEvents.NodeAdded(args, opts)
 * @param chunkSize  block span per RPC call (default: 8_000n)
 * @returns          collected events (ordered per `order`)
 */
export async function collectEventsInRange<T>(
  fromBlock: bigint,
  toBlock: bigint,
  count: number = -1,
  fetcher: Fetcher<T>
): Promise<T[]> {
  const chunkSize = 2048n;

  let order = "asc";
  if (fromBlock > toBlock) {
    order = "desc";
    [fromBlock, toBlock] = [toBlock, fromBlock];
  }
  if (count === 0) return [];

  const out: T[] = [];

  if (order === "asc") {
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
      const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
      const batch = await fetcher({ fromBlock: start, toBlock: end });
      if (batch?.length) {
        out.push(...batch);
        if (count > 0 && out.length >= count) {
          out.length = count;
          return out;
        }
      }
      if (end === toBlock) break;
    }
  } else {
    for (let end = toBlock; end >= fromBlock; end -= chunkSize) {
      const start = end - (chunkSize - 1n) < fromBlock ? fromBlock : end - (chunkSize - 1n);
      let batch = await fetcher({ fromBlock: start, toBlock: end });
      if (batch?.length) {
        batch = [...batch].reverse();
        out.push(...batch);
        if (count > 0 && out.length >= count) {
          out.length = count;
          return out;
        }
      }
      if (start === fromBlock) break;
    }
  }
  return out;
}
