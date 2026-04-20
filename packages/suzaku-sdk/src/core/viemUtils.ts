import {
  getContract,
  type GetContractReturnType,
  type Address,
  parseEventLogs,
  type Hex,
  type Abi,
  type AbiEvent,
  type ContractFunctionName,
  type ContractFunctionArgs,
  type ContractFunctionReturnType,
  ContractFunctionExecutionError,
  type GetEventArgs,
  type ParseEventLogsReturnType,
  type ContractEventName,
} from 'viem';
import { SuzakuABI } from './abis/index';
import { type ExtendedClient, type ExtendedWalletClient } from './client/types';
import { logger } from './logger/index';
import AhoCorasick from 'modern-ahocorasick';
import AllSelectors from './abis/abi-selectors.json';

// ── Types ────────────────────────────────────────────────────────────────────

export type SuzakuABINames = keyof typeof SuzakuABI;
export type TSuzakuABI = { [K in SuzakuABINames]: typeof SuzakuABI[K] };

type MakeAccountOptionalInWrite<T> = T extends { write: infer W }
  ? Omit<T, 'write'> & {
    write: {
      [K in keyof W]: W[K] extends (args: infer A, options: infer O) => infer R
      ? A extends O
      ? (options?: Omit<O, 'account'> & { account?: O extends { account: infer Acc } ? Acc : never }) => R
      : (args: A, options?: Omit<O, 'account'> & { account?: O extends { account: infer Acc } ? Acc : never }) => R
      : W[K]
    }
  }
  : T;

export type SuzakuContract = {
  [K in SuzakuABINames]: MakeAccountOptionalInWrite<GetContractReturnType<typeof SuzakuABI[K], ExtendedClient>> & {
    address: Hex;
    name: string;
    multicall: MulticallFn<K>;
    getLogs: GetLogsFn<K>;
  }
};

export type TWriteSuzakuContract = { [K in SuzakuABINames]: SuzakuContract[K] extends { write: infer W } ? W : never };
export type SafeSuzakuContract = { [K in SuzakuABINames]: SuzakuContract[K] & { safeWrite: TWriteSuzakuContract[K] } };

type ReadFunctionNames<T extends SuzakuABINames> = ContractFunctionName<typeof SuzakuABI[T], 'view' | 'pure'>;

type HasArgs<T extends SuzakuABINames, FName extends ReadFunctionNames<T>> =
  ContractFunctionArgs<typeof SuzakuABI[T], 'view' | 'pure', FName> extends readonly [] ? false : true;

type MulticallItem<T extends SuzakuABINames, FName extends ReadFunctionNames<T> = ReadFunctionNames<T>> =
  FName extends ReadFunctionNames<T>
  ? HasArgs<T, FName> extends true
  ? { name: FName; args: ContractFunctionArgs<typeof SuzakuABI[T], 'view' | 'pure', FName> }
  : FName | { name: FName }
  : never;

type ExtractFunctionName<T extends SuzakuABINames, Item> =
  Item extends string ? Item :
  Item extends { name: infer N } ? N extends ReadFunctionNames<T> ? N : never :
  never;

type MulticallItemResult<T extends SuzakuABINames, Item> =
  ExtractFunctionName<T, Item> extends ReadFunctionNames<T>
  ? ContractFunctionReturnType<typeof SuzakuABI[T], 'view' | 'pure', ExtractFunctionName<T, Item>>
  : never;

type MulticallResultsDetailed<T extends SuzakuABINames, Items extends readonly MulticallItem<T>[]> = {
  [K in keyof Items]: { name: ExtractFunctionName<T, Items[K]>; result: MulticallItemResult<T, Items[K]> }
};

type MulticallResultsSimple<T extends SuzakuABINames, Items extends readonly MulticallItem<T>[]> = {
  [K in keyof Items]: MulticallItemResult<T, Items[K]>
};

export interface MulticallOptions<D extends boolean = false, S extends boolean = true> {
  strict?: S;
  details?: D;
}

type MulticallFn<T extends SuzakuABINames> = {
  <const Items extends readonly MulticallItem<T>[], D extends boolean = false, S extends boolean = true>(
    items: Items,
    options?: MulticallOptions<D, S>
  ): Promise<D extends true ? MulticallResultsDetailed<T, Items> : MulticallResultsSimple<T, Items>>;
};

type EventName<T extends SuzakuABINames> = ContractEventName<typeof SuzakuABI[T]>

type GetLogsParams<T extends SuzakuABINames, E extends EventName<T> | EventName<T>[] | undefined = undefined> = {
  fromBlock?: bigint;
  blockLookBack?: bigint;
  toBlock?: bigint | 'latest';
  hash?: Hex;
  event?: E;
  args?: E extends EventName<T>
  ? GetEventArgs<typeof SuzakuABI[T], E, { EnableUnion: false; IndexedOnly: false }>
  : Record<string, unknown>;
}

type GetLogsFn<T extends SuzakuABINames> = <E extends EventName<T> | EventName<T>[] | undefined = undefined>(
  params?: GetLogsParams<T, E>
) => Promise<ParseEventLogsReturnType<typeof SuzakuABI[T], E extends EventName<T>[] ? E[number] : E>>

export type CurriedContractFn<T extends SuzakuABINames, C extends ExtendedClient> = (address?: Address) => Promise<C extends ExtendedWalletClient ? SafeSuzakuContract[T] : SuzakuContract[T]>;
export type CurriedSuzakuContractMap<C extends ExtendedClient> = { [key in SuzakuABINames]: CurriedContractFn<key, C> }

// ── Minimal client interface for ABI validation ───────────────────────────────

export interface AbiValidationClient {
  getStorageAt(args: { address: Address; slot: Hex }): Promise<Hex | undefined>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
}

// ── Utilities ────────────────────────────────────────────────────────────────

export function bigintReplacer(_key: string, value: any) {
  if (typeof value === 'bigint') return Number(value);
  return value;
}

export function bytes32ToAddress(bytes32: `0x${string}`): Address {
  return `0x${bytes32.slice(-40)}` as Address;
}

function handleContractError(error: any, abi: SuzakuABINames): never {
  if (error instanceof ContractFunctionExecutionError) {
    throw new Error(`${abi} ${error.cause}`);
  } else if (error instanceof Error || (error instanceof Object && 'message' in error)) {
    const i = (error as Error).message.indexOf('Docs:');
    const msg = i === -1 ? (error as Error).message : `${abi} ${(error as Error).message.slice(0, i - 1)}`;
    throw new Error(msg);
  }
  throw error;
}

// ── contractAbiValidation ─────────────────────────────────────────────────────

export async function contractAbiValidation<T extends SuzakuABINames>(
  client: AbiValidationClient,
  abis: T[],
  address: Address,
): Promise<{ name: T; ratio: number; valid: boolean }[]> {
  const TOLERANCE = 0.06;

  const proxyImplementation = await client.getStorageAt({
    address,
    slot: '0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC',
  });
  if (proxyImplementation !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    address = bytes32ToAddress(proxyImplementation as `0x${string}`);
    logger.debug(`Detected proxy contract. Using implementation at address ${address} for ABI validation.`);
  }

  let contractByteCode = await client.getCode({ address });
  if (!contractByteCode || contractByteCode === '0x') {
    throw new Error(`No contract found at address ${address} for ABIs ${abis.join(', ')}`);
  }

  if (contractByteCode.startsWith('0x363d3d373d3d3d363d73') && contractByteCode.endsWith('5af43d82803e903d91602b57fd5bf3')) {
    const implementationAddress = '0x' + contractByteCode.slice(22, 62);
    logger.debug(`Detected EIP-1167 minimal proxy. Using implementation at address ${implementationAddress} for ABI validation.`);
    contractByteCode = await client.getCode({ address: implementationAddress as Address });
    if (!contractByteCode || contractByteCode === '0x') {
      throw new Error(`No contract found at address ${address} for ABIs ${abis.join(', ')}`);
    }
  }

  const ACs: [AhoCorasick, number][] = abis.map((abi) => {
    const selectors = (AllSelectors as Record<string, string[]>)[abi];
    if (!selectors) {
      logger.warn(`No selectors found for ABI ${abi}, skipping validation`);
      return [new AhoCorasick([]), 0];
    }
    return [new AhoCorasick(selectors), Object.keys(selectors).length];
  });

  const missingRatio = ACs.map(([ac, selectorCount]) => {
    const matches = new Set(ac.search(contractByteCode!).map((m: any) => m[1][0]));
    const missingCount = selectorCount - matches.size;
    return [missingCount, missingCount / selectorCount, matches] as [number, number, Set<string>];
  });

  const result = missingRatio.reduce((acc, [missingCount, ratio, matches], i) => {
    if (ratio > 0) {
      const selectors = (AllSelectors as Record<string, string[]>)[abis[i]];
      logger.debug(`ABI validation for contract ${abis[i]} at address ${address}: ${matches.size} selectors matched, ${missingCount} missing (${(ratio * 100).toFixed(2)}% missing)`);
      if (selectors) {
        logger.debug(`Missing selectors: ${selectors.filter((s: string) => !matches.has(s)).join(', ')}`);
      }
    }
    return [...acc, { name: abis[i], ratio, valid: ratio < TOLERANCE }];
  }, [] as { name: T; ratio: number; valid: boolean }[]);

  if (result.every((r) => !r.valid)) {
    throw new Error(`The contract at address ${address} does not match the expected ABI for ${abis.join(', ')} contract.`);
  }
  return result;
}

// ── withMulticall ─────────────────────────────────────────────────────────────

export function withMulticall<T extends SuzakuABINames>(
  contract: SuzakuContract[T],
  abi: T,
  client: ExtendedClient,
): SuzakuContract[T] {
  contract.name = abi;

  if ('read' in contract) {
    const readHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop) {
        const fn = (target as any)[prop];
        if (typeof fn !== 'function') return fn;
        return async (...args: any[]) => {
          try {
            const result = await fn(...args);
            const functionSignature = `${contract.name}.${prop as string}(${args.join ? args.join(', ') : args})`;
            logger.addData('receipt', { functionSignature, result });
            return result;
          } catch (error: any) {
            handleContractError(error, abi);
          }
        };
      },
    };

    (contract as any).read = new Proxy(contract.read as Record<string, any>, readHandler);

    (contract as any).multicall = async (items: Array<string | { name: string; args?: readonly unknown[] }>, options?: MulticallOptions) => {
      const contracts = items.map((item) => {
        const functionName = typeof item === 'string' ? item : item.name;
        const args = typeof item === 'object' && 'args' in item ? item.args : [];
        return { address: contract.address, abi: SuzakuABI[abi] as Abi, functionName, args };
      });

      const results = await client.multicall({ contracts: contracts as any });

      return results.map((result, index) => {
        const item = items[index];
        const name = typeof item === 'string' ? item : item.name;
        if (result.status === 'failure') {
          if (options?.strict) throw new Error(`Multicall failed for ${name}: ${result.error}`);
          logger.warn(`Multicall failed for ${name}: ${result.error}`);
        }
        return options?.details ? {
          name,
          result: result.status === 'success' ? result.result : undefined,
          args: typeof item === 'object' && 'args' in item ? item.args : [],
        } : result.result;
      });
    };

    const findAbiEvent = (name: EventName<T>): AbiEvent | undefined =>
      (SuzakuABI[abi] as Abi).find((item): item is AbiEvent => item.type === 'event' && (item as AbiEvent).name === name);

    type WideGetLogsParams = {
      fromBlock?: bigint;
      blockLookBack?: bigint;
      toBlock?: bigint | 'latest';
      hash?: Hex;
      event?: EventName<T> | EventName<T>[];
      args?: Record<string, unknown>;
    }

    const getLogsFn = async (params?: WideGetLogsParams): Promise<ParseEventLogsReturnType<typeof SuzakuABI[T]>> => {
      let fromBlock: bigint | undefined;
      if (params?.blockLookBack !== undefined) {
        const currentBlock = await client.getBlockNumber();
        fromBlock = currentBlock > params.blockLookBack ? currentBlock - params.blockLookBack : 0n;
      } else {
        fromBlock = params?.fromBlock;
      }
      const toBlock = params?.toBlock ?? 'latest';
      const { hash, event, args } = params ?? {};
      const abiList = SuzakuABI[abi] as Abi;

      let result: unknown;

      if (hash) {
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 0 });
        if (receipt.status === 'reverted') throw new Error(`Transaction ${hash} reverted`);
        result = parseEventLogs({
          abi: abiList,
          logs: receipt.logs,
          ...(event !== undefined ? { eventName: event as EventName<T> | EventName<T>[] } : {}),
        });
      } else if (Array.isArray(event)) {
        const abiEvents = event.map(findAbiEvent).filter((e): e is AbiEvent => e !== undefined);
        result = await client.getLogs({ address: contract.address, events: abiEvents, fromBlock, toBlock });
      } else {
        const abiEvent = event ? findAbiEvent(event) : undefined;
        result = abiEvent
          ? await client.getLogs({ address: contract.address, event: abiEvent, args: args as Record<string, unknown>, fromBlock, toBlock })
          : await client.getLogs({ address: contract.address, fromBlock, toBlock });
      }

      return result as ParseEventLogsReturnType<typeof SuzakuABI[T]>;
    };

    (contract as unknown as { getLogs: GetLogsFn<T> }).getLogs = getLogsFn as GetLogsFn<T>;
  }

  return contract as unknown as SuzakuContract[T];
}

// ── withSafeWrite ─────────────────────────────────────────────────────────────
// Base feature: simulate before call. No Safe wallet (Gnosis), no cast mode.

export function withSafeWrite<T extends SuzakuABINames>(
  contract: SuzakuContract[T],
  abi: T,
  client: ExtendedClient,
  confirmations = 1,
): SafeSuzakuContract[T] {
  contract.name = abi;

  if ('write' in contract) {
    // Proxy contract.write to add receipt waiting and log parsing
    const writeHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop) {
        const fn = (target as any)[prop];
        if (typeof fn !== 'function') return fn;
        return async (args: any, options: any) => {
          try {
            const hash = await fn(args, { chain: null, account: client.account, ...options });
            const sig = `${contract.name}.${prop as string}(${args?.join ? args.join(', ') : args})`;
            logger.addData('txs', { to: contract.address, invocation: sig, hash, options });
            if (!hash) return undefined;
            const receipt = await client.waitForTransactionReceipt({ hash, confirmations });
            if (receipt.status === 'reverted') {
              throw new Error(`Transaction ${sig} (hash: ${hash}) reverted, pls resend the transaction:\n` + JSON.stringify(receipt.logs, bigintReplacer));
            }
            const logs = parseEventLogs({ abi: SuzakuABI[abi], logs: receipt.logs });
            if (logs.length > 0) {
              logger.log('\nLogs emitted during the transaction:');
              logger.log(logs.map((log: any) => `  ${log.eventName}${JSON.stringify(log.args, bigintReplacer)}`).join('\n'));
              logger.log('');
              logger.addData('receipt', receipt);
            }
            return hash;
          } catch (error: any) {
            handleContractError(error, abi);
          }
        };
      },
    };

    (contract as any).write = new Proxy(contract.write as Record<string, any>, writeHandler);

    // contract.safeWrite: simulate first, then call contract.write (dynamically resolved
    // so that node-layer wrappers applied after this are picked up correctly)
    (contract as any).safeWrite = new Proxy({} as Record<string, any>, {
      get(_target, prop) {
        return async (args: any, options: any) => {
          try {
            const simulateFn = (contract as any).simulate?.[prop];
            if (typeof simulateFn === 'function') {
              await simulateFn(args, options);
            }
            return await (contract as any).write[prop as string](args, options);
          } catch (error: any) {
            handleContractError(error, abi);
          }
        };
      },
    });
  }

  return contract as unknown as SafeSuzakuContract[T];
}

// ── curriedContract ───────────────────────────────────────────────────────────

export const curriedContract = <T extends SuzakuABINames, C extends ExtendedClient>(
  abi: T,
  client: C,
  wait = 0,
  skipAbiValidation: boolean = false,
): CurriedContractFn<T, C> =>
  async (address?: Address) => {
    const envVar = abi.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
    if (!address) {
      if (process.env[envVar]) address = process.env[envVar] as Address;
      else throw new Error(`Address is required to create a contract instance for ${abi}. Please provide associated option or set as environment variable ${envVar}`);
    }
    if (!skipAbiValidation) {
      await contractAbiValidation(client, abi.includes('StakingVault') ? (['StakingVault'] as T[]) : [abi], address);
    }
    const contract = withMulticall(
      getContract({ abi: SuzakuABI[abi], address, client }) as SuzakuContract[T],
      abi,
      client,
    );
    return withSafeWrite(contract, abi, client, wait) as any;
  };
