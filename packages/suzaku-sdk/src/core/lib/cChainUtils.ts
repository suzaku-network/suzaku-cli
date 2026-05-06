import { decodeEventLog, type Hex, type Abi } from 'viem';
import { type ExtendedClient } from '../client/types';
import { type EnhancedContract } from '../client/viemUtils';
import { logger } from '../logger/index';
import type BalancerValidatorManagerAbi from '../BalancerValidatorManager/abi';

interface ProgressBar {
    start(total: number, startValue: number): void;
    stop(): void;
    increment(value?: number): void;
    setTotal(total: number): void;
    getTotal(): number;
    getProgress(): number;
}

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
};

export async function getChainId(rpcUrl: string): Promise<number> {
    const ret = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
    });
    const data = await ret.json();
    return data.result;
}

export async function PatchEventsTimestamp(
    client: ExtendedClient,
    events: DecodedEvent[],
): Promise<DecodedEvent[]> {
    const blockTimestamps = (
        await Promise.all(
            [...new Set(events.map(event => event.blockNumber))].map((blockNumber: bigint) =>
                client.getBlock({ blockNumber, includeTransactions: false }),
            ),
        )
    ).reduce(
        (acc, block) => {
            acc[Number(block.number)] = Number(block.timestamp);
            return acc;
        },
        {} as Record<number, number>,
    );

    return events.map(event => ({
        ...event,
        timestamp: event.timestamp || blockTimestamps[Number(event.blockNumber)],
    }));
}

export async function fillEventsNodeId(
    balancer: EnhancedContract<typeof BalancerValidatorManagerAbi, ExtendedClient>,
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
    }

    return events;
}

export async function blockAtTimestamp(
    client: ExtendedClient,
    ts: bigint,
    mode: 'lte' | 'gte' = 'lte',
    recentWindow: bigint = 10_000_0n,
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

    const b0 = latestN > recentWindow ? latestN - recentWindow : 0n;
    const [t0, t1] = await Promise.all([getTS(b0), getTS(latestN)]);
    const avgRecent = Number(t1 - t0) / Math.max(1, Number(latestN - b0)) || 12;

    let est = latestN - BigInt(Math.floor(Number(latestTs - ts) / Math.max(1e-6, avgRecent)));
    if (est < 0n) est = 0n;
    if (est > latestN) est = latestN;

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
            step <<= 1n;
        }
    } else {
        hi = est; hiTs = estTs;
        let step = 1n;
        while (true) {
            const next = est > step ? est - step : 0n;
            lo = next;
            loTs = await getTS(lo);
            if (loTs <= ts || lo === 0n) break;
            step <<= 1n;
        }
    }

    while (lo + 1n < hi) {
        const denom = hiTs - loTs;
        let mid = denom > 0n ? lo + ((ts - loTs) * (hi - lo)) / denom : (lo + hi) >> 1n;
        if (mid <= lo) mid = lo + 1n;
        else if (mid >= hi) mid = hi - 1n;

        const midTs = await getTS(mid);
        if (midTs <= ts) { lo = mid; loTs = midTs; }
        else { hi = mid; hiTs = midTs; }
    }

    return mode === 'lte' ? lo : hi;
}

type FetchOpts = { fromBlock: bigint; toBlock: bigint };
type Fetcher<T> = (opts: FetchOpts) => Promise<T[]>;

export async function GetContractEvents(
    client: ExtendedClient,
    address: Hex,
    fromBlock: number,
    toBlock: number,
    abi: Abi,
    eventNames?: string[],
    snowscanApiKey?: string,
    forceTimestamp: boolean = true,
    bar?: ProgressBar,
): Promise<DecodedEvent[]> {
    let events: CommonEvent[] = [];
    try {
        if (snowscanApiKey) {
            const url = `https://api${client.network === 'fuji' ? '-testnet' : ''}.snowscan.xyz/api`;
            const urlParams = new URLSearchParams({
                module: 'logs', action: 'getLogs', address,
                fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), apikey: snowscanApiKey,
            });
            const res = await fetch(`${url}?${urlParams}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { status: string; message: string; result: any[] };
            events = data.result.reduce(
                (acc: [], log) => [Object.assign(log, decodeEventLog({ abi, data: log.data, topics: log.topics })), ...acc],
                [],
            );
        } else {
            toBlock = toBlock - 2;
            const blockToScan = toBlock - fromBlock;
            bar?.setTotal((bar.getTotal() + blockToScan) || blockToScan);
            for (let i = fromBlock; i <= toBlock; i += 2000) {
                const toSub = i + 2000 > toBlock ? toBlock : i + 2000;
                events.push(...await client.getContractEvents({ address, abi, fromBlock: BigInt(i), toBlock: BigInt(toSub) }));
                bar?.increment(2000);
            }
            bar?.increment(blockToScan - (toBlock - fromBlock));
            if (bar && bar.getProgress() === 1) bar.stop();
        }
    } catch (error) {
        logger.error('Read contract failed:', error);
        if (error instanceof Error) logger.error(error.message);
    }

    const result = events
        .filter((log: CommonEvent) => eventNames ? eventNames.includes(log.eventName!) : true)
        .map(log => ({
            blockNumber: typeof log.blockNumber === 'bigint' ? log.blockNumber : BigInt(log.blockNumber),
            transactionHash: log.transactionHash,
            eventName: log.eventName,
            args: log.args,
            address: log.address,
            timestamp: Number(log.timeStamp!),
        } as DecodedEvent));

    return forceTimestamp ? snowscanApiKey ? result : PatchEventsTimestamp(client, result) : result;
}

export async function collectEventsInRange<T>(
    fromBlock: bigint,
    toBlock: bigint,
    count: number = -1,
    fetcher: Fetcher<T>,
): Promise<T[]> {
    const chunkSize = 2048n;

    let order = 'asc';
    if (fromBlock > toBlock) {
        order = 'desc';
        [fromBlock, toBlock] = [toBlock, fromBlock];
    }
    if (count === 0) return [];

    const out: T[] = [];

    if (order === 'asc') {
        for (let start = fromBlock; start <= toBlock; start += chunkSize) {
            const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
            const batch = await fetcher({ fromBlock: start, toBlock: end });
            if (batch?.length) {
                out.push(...batch);
                if (count > 0 && out.length >= count) { out.length = count; return out; }
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
                if (count > 0 && out.length >= count) { out.length = count; return out; }
            }
            if (start === fromBlock) break;
        }
    }
    return out;
}
