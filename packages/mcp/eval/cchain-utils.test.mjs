import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { GetContractEvents, getFinalizedBlockNumber, resolveEventScanEnd } from '../../../dist/lib/cChainUtils.js';

const ADDRESS = `0x${'1'.repeat(40)}`;
const API_KEY = 'explorer-secret';
const EMPTY_ABI = [];

function client(network, chainId = network === 'fuji' ? 43113 : 43114) {
  return {
    network,
    getChainId: vi.fn(async () => chainId),
    getContractEvents: vi.fn(async () => []),
    getBlock: vi.fn(async ({ blockNumber }) => ({ blockNumber, number: blockNumber, timestamp: 1n })),
  };
}

function response(result, status = '1', message = 'OK') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status, message, result }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Etherscan V2 event transport', () => {
  it.each([
    ['mainnet', '43114'],
    ['fuji', '43113'],
  ])('uses the Avalanche chain id for %s without exposing the key elsewhere', async (network, chainid) => {
    const fetchMock = vi.fn(async () => response([]));
    vi.stubGlobal('fetch', fetchMock);

    await GetContractEvents(client(network), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY);

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.etherscan.io/v2/api');
    expect(url.searchParams.get('chainid')).toBe(chainid);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('offset')).toBe('1000');
    expect(url.searchParams.get('apikey')).toBe(API_KEY);
  });

  it('paginates full pages so event history is not silently truncated', async () => {
    const undecodableLog = {
      address: ADDRESS,
      topics: ['0x00'],
      data: '0x',
      blockNumber: '0x1',
      blockHash: `0x${'2'.repeat(64)}`,
      transactionHash: `0x${'3'.repeat(64)}`,
      transactionIndex: '0x0',
      timeStamp: '0x1',
      logIndex: '0x0',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(Array.from({ length: 1000 }, () => undecodableLog)))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal('fetch', fetchMock);

    await GetContractEvents(client('mainnet'), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('page')).toBe('2');
  });

  it('accepts only the canonical empty no-records response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([], '0', 'No records found')));
    await expect(GetContractEvents(
      client('mainnet'), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY,
    )).resolves.toEqual([]);

    vi.stubGlobal('fetch', vi.fn(async () => response([], '0', 'NOTOK')));
    await expect(GetContractEvents(
      client('mainnet'), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY,
    )).rejects.toThrow('Explorer API NOTOK');
  });

  it('throws provider errors instead of turning them into an empty successful scan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(
      'Free API access is not supported for this chain',
      '0',
      'NOTOK',
    )));

    await expect(GetContractEvents(
      client('mainnet'), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY,
    )).rejects.toThrow('Free API access is not supported');
  });

  it('does not include the credential in network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`failed ${API_KEY}`); }));

    const error = await GetContractEvents(
      client('mainnet'), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY,
    ).catch((caught) => caught);
    expect(error.message).toBe('Explorer API request failed');
    expect(error.message).not.toContain(API_KEY);
  });

  it('redacts the credential if an explorer error body echoes it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(
      `invalid credential ${API_KEY}`,
      '0',
      'NOTOK',
    )));

    const error = await GetContractEvents(
      client('mainnet'), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY,
    ).catch((caught) => caught);
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain(API_KEY);
  });

  it('redacts credentials echoed inside an array-shaped provider error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(
      [`invalid credential ${API_KEY}`],
      '0',
      'NOTOK',
    )));

    const error = await GetContractEvents(
      client('mainnet'), ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY,
    ).catch((caught) => caught);
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain(API_KEY);
  });

  it('falls back to RPC when the runtime chain is not Avalanche', async () => {
    const kiteClient = client('mainnet', 2366);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await GetContractEvents(kiteClient, ADDRESS, 10, 20, EMPTY_ABI, undefined, API_KEY);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(kiteClient.getContractEvents).toHaveBeenCalled();
    expect(kiteClient.getContractEvents.mock.calls[0][0]).toMatchObject({
      fromBlock: 10n,
      toBlock: 20n,
    });
  });

  it('patches a missing RPC timestamp from the event block', async () => {
    const rpcClient = client('mainnet');
    rpcClient.getContractEvents.mockResolvedValueOnce([{
      address: ADDRESS,
      blockNumber: 12n,
      transactionHash: `0x${'3'.repeat(64)}`,
      eventName: 'ValueSet',
      args: { value: 7n },
    }]);
    rpcClient.getBlock.mockResolvedValueOnce({ number: 12n, timestamp: 123n });

    const events = await GetContractEvents(rpcClient, ADDRESS, 10, 20, EMPTY_ABI);

    expect(events[0].timestamp).toBe(123);
    expect(rpcClient.getBlock).toHaveBeenCalledWith({ blockNumber: 12n, includeTransactions: false });
  });

  it('patches a missing explorer timestamp but preserves valid explorer timestamps', async () => {
    const abi = [{
      type: 'event',
      name: 'ValueSet',
      anonymous: false,
      inputs: [{ indexed: false, name: 'value', type: 'uint256' }],
    }];
    const eventClient = client('mainnet');
    eventClient.getBlock.mockResolvedValueOnce({ number: 16n, timestamp: 321n });
    vi.stubGlobal('fetch', vi.fn(async () => response([{
      address: ADDRESS,
      topics: encodeEventTopics({ abi, eventName: 'ValueSet' }),
      data: encodeAbiParameters([{ type: 'uint256' }], [7n]),
      blockNumber: '0x10',
      blockHash: `0x${'2'.repeat(64)}`,
      transactionHash: `0x${'3'.repeat(64)}`,
      transactionIndex: '0x0',
      logIndex: '0x0',
    }])));

    const events = await GetContractEvents(eventClient, ADDRESS, 10, 20, abi, ['ValueSet'], API_KEY);

    expect(events[0].timestamp).toBe(321);
    expect(eventClient.getBlock).toHaveBeenCalledOnce();
  });

  it('uses latest minus two only for an open-ended caller range and clamps small chains', async () => {
    expect(await getFinalizedBlockNumber({ getBlockNumber: vi.fn(async () => 20n) })).toBe(18n);
    expect(await getFinalizedBlockNumber({ getBlockNumber: vi.fn(async () => 1n) })).toBe(0n);
    expect(resolveEventScanEnd(20n, 20n)).toBe(20n);
    expect(resolveEventScanEnd(20n, undefined, 17n)).toBe(17n);
  });

  it('decodes explorer logs and preserves their timestamp without a block RPC read', async () => {
    const abi = [{
      type: 'event',
      name: 'ValueSet',
      anonymous: false,
      inputs: [{ indexed: false, name: 'value', type: 'uint256' }],
    }];
    const eventClient = client('mainnet');
    vi.stubGlobal('fetch', vi.fn(async () => response([{
      address: ADDRESS,
      topics: encodeEventTopics({ abi, eventName: 'ValueSet' }),
      data: encodeAbiParameters([{ type: 'uint256' }], [7n]),
      blockNumber: '0x10',
      blockHash: `0x${'2'.repeat(64)}`,
      transactionHash: `0x${'3'.repeat(64)}`,
      transactionIndex: '0x0',
      timeStamp: '0x64',
      logIndex: '0x0',
    }])));

    const events = await GetContractEvents(
      eventClient, ADDRESS, 10, 20, abi, ['ValueSet'], API_KEY,
    );

    expect(events).toHaveLength(1);
    expect(events[0].args.value).toBe(7n);
    expect(events[0].timestamp).toBe(100);
    expect(eventClient.getBlock).not.toHaveBeenCalled();
  });
});
