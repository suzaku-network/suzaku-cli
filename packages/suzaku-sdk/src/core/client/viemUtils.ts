import {
  getContract as viemGetContract,
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
import { type ExtendedClient, type ExtendedWalletClient } from './types';
import { logger } from '../logger/index';
import AhoCorasick from 'modern-ahocorasick';
import type { Config } from '../config';

// ── Types ────────────────────────────────────────────────────────────────────

// EnhancedContract: adds address, name, multicall, getLogs on top of viem's GetContractReturnType
export type EnhancedContract<TAbi extends Abi, C extends ExtendedClient> =
  GetContractReturnType<TAbi, C> & {
    address: Hex;
    name: string;
    multicall: MulticallFn<TAbi>;
    getLogs: GetLogsFn<TAbi>;
  };

export type SafeEnhancedContract<TAbi extends Abi, C extends ExtendedClient> =
  EnhancedContract<TAbi, C> & { safeWrite: SafeWriteFn<TAbi> };

// Internal helpers for multicall / getLogs typing

type ReadFunctionNames<TAbi extends Abi> = ContractFunctionName<TAbi, 'view' | 'pure'>;

type HasArgs<TAbi extends Abi, FName extends ReadFunctionNames<TAbi>> =
  ContractFunctionArgs<TAbi, 'view' | 'pure', FName> extends readonly [] ? false : true;

type MulticallItem<TAbi extends Abi, FName extends ReadFunctionNames<TAbi> = ReadFunctionNames<TAbi>> =
  FName extends ReadFunctionNames<TAbi>
  ? HasArgs<TAbi, FName> extends true
  ? { name: FName; args: ContractFunctionArgs<TAbi, 'view' | 'pure', FName> }
  : FName | { name: FName }
  : never;

type ExtractFunctionName<TAbi extends Abi, Item> =
  Item extends string ? Item :
  Item extends { name: infer N } ? N extends ReadFunctionNames<TAbi> ? N : never :
  never;

type MulticallItemResult<TAbi extends Abi, Item> =
  ExtractFunctionName<TAbi, Item> extends ReadFunctionNames<TAbi>
  ? ContractFunctionReturnType<TAbi, 'view' | 'pure', ExtractFunctionName<TAbi, Item>>
  : never;

type MulticallResultsDetailed<TAbi extends Abi, Items extends readonly MulticallItem<TAbi>[]> = {
  [K in keyof Items]: { name: ExtractFunctionName<TAbi, Items[K]>; result: MulticallItemResult<TAbi, Items[K]> }
};

type MulticallResultsSimple<TAbi extends Abi, Items extends readonly MulticallItem<TAbi>[]> = {
  [K in keyof Items]: MulticallItemResult<TAbi, Items[K]>
};

export interface MulticallOptions<D extends boolean = false, S extends boolean = true> {
  strict?: S;
  details?: D;
}

type MulticallFn<TAbi extends Abi> = {
  <const Items extends readonly MulticallItem<TAbi>[], D extends boolean = false, S extends boolean = true>(
    items: Items,
    options?: MulticallOptions<D, S>
  ): Promise<D extends true ? MulticallResultsDetailed<TAbi, Items> : MulticallResultsSimple<TAbi, Items>>;
};

type SafeWriteFn<TAbi extends Abi> = Record<string, (...args: any[]) => Promise<Hex>>;

type EventName<TAbi extends Abi> = ContractEventName<TAbi>

type GetLogsParams<TAbi extends Abi, E extends EventName<TAbi> | EventName<TAbi>[] | undefined = undefined> = {
  fromBlock?: bigint;
  blockLookBack?: bigint;
  toBlock?: bigint | 'latest';
  hash?: Hex;
  event?: E;
  args?: E extends EventName<TAbi>
  ? GetEventArgs<TAbi, E, { EnableUnion: false; IndexedOnly: false }>
  : Record<string, unknown>;
}

type GetLogsFn<TAbi extends Abi> = <E extends EventName<TAbi> | EventName<TAbi>[] | undefined = undefined>(
  params?: GetLogsParams<TAbi, E>
) => Promise<ParseEventLogsReturnType<TAbi, E extends EventName<TAbi>[] ? E[number] : E>>

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

function handleContractError(error: any, abiName: string): never {
  if (error instanceof ContractFunctionExecutionError) {
    throw new Error(`${abiName} ${error.cause}`);
  } else if (error instanceof Error || (error instanceof Object && 'message' in error)) {
    const i = (error as Error).message.indexOf('Docs:');
    const msg = i === -1 ? (error as Error).message : `${abiName} ${(error as Error).message.slice(0, i - 1)}`;
    throw new Error(msg);
  }
  throw error;
}

// ── contractAbiValidation ─────────────────────────────────────────────────────

export async function contractAbiValidation(
  client: AbiValidationClient,
  selectors: readonly string[],
  abiName: string,
  address: Address,
): Promise<{ ratio: number; valid: boolean }> {
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
    throw new Error(`No contract found at address ${address} for ABI ${abiName}`);
  }

  if (contractByteCode.startsWith('0x363d3d373d3d3d363d73') && contractByteCode.endsWith('5af43d82803e903d91602b57fd5bf3')) {
    const implementationAddress = '0x' + contractByteCode.slice(22, 62);
    logger.debug(`Detected EIP-1167 minimal proxy. Using implementation at address ${implementationAddress} for ABI validation.`);
    contractByteCode = await client.getCode({ address: implementationAddress as Address });
    if (!contractByteCode || contractByteCode === '0x') {
      throw new Error(`No contract found at address ${address} for ABI ${abiName}`);
    }
  }

  if (selectors.length === 0) {
    logger.warn(`No selectors found for ABI ${abiName}, skipping validation`);
    return { ratio: 0, valid: true };
  }

  const ac = new AhoCorasick(selectors as string[]);
  const matches = new Set(ac.search(contractByteCode).map((m: any) => m[1][0]));
  const missingCount = selectors.length - matches.size;
  const ratio = missingCount / selectors.length;

  if (ratio > 0) {
    logger.debug(`ABI validation for ${abiName} at ${address}: ${matches.size}/${selectors.length} selectors matched (${(ratio * 100).toFixed(2)}% missing)`);
    logger.debug(`Missing selectors: ${(selectors as string[]).filter((s) => !matches.has(s)).join(', ')}`);
  }

  if (ratio >= TOLERANCE) {
    throw new Error(`The contract at address ${address} does not match the expected ABI for ${abiName}.`);
  }
  return { ratio, valid: ratio < TOLERANCE };
}

// ── withMulticall ─────────────────────────────────────────────────────────────

export function withMulticall<const TAbi extends Abi, C extends ExtendedClient>(
  contract: GetContractReturnType<TAbi, C>,
  abi: TAbi,
  abiName: string,
  client: C,
): EnhancedContract<TAbi, C> {
  const enhanced = contract as unknown as EnhancedContract<TAbi, C>;
  enhanced.name = abiName;

  if ('read' in contract) {
    const readHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop) {
        const fn = (target as any)[prop];
        if (typeof fn !== 'function') return fn;
        return async (...args: any[]) => {
          try {
            const result = await fn(...args);
            const functionSignature = `${enhanced.name}.${prop as string}(${args.join ? args.join(', ') : args})`;
            logger.addData('receipt', { functionSignature, result });
            return result;
          } catch (error: any) {
            handleContractError(error, abiName);
          }
        };
      },
    };

    (enhanced as any).read = new Proxy(contract.read as Record<string, any>, readHandler);

    (enhanced as any).multicall = async (items: Array<string | { name: string; args?: readonly unknown[] }>, options?: MulticallOptions) => {
      const contracts = items.map((item) => {
        const functionName = typeof item === 'string' ? item : item.name;
        const args = typeof item === 'object' && 'args' in item ? item.args : [];
        return { address: enhanced.address, abi: abi as Abi, functionName, args };
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

    const findAbiEvent = (name: string): AbiEvent | undefined =>
      (abi as Abi).find((item): item is AbiEvent => item.type === 'event' && (item as AbiEvent).name === name);

    type WideGetLogsParams = {
      fromBlock?: bigint;
      blockLookBack?: bigint;
      toBlock?: bigint | 'latest';
      hash?: Hex;
      event?: string | string[];
      args?: Record<string, unknown>;
    }

    const getLogsFn = async (params?: WideGetLogsParams): Promise<ParseEventLogsReturnType<TAbi>> => {
      let fromBlock: bigint | undefined;
      if (params?.blockLookBack !== undefined) {
        const currentBlock = await client.getBlockNumber();
        fromBlock = currentBlock > params.blockLookBack ? currentBlock - params.blockLookBack : 0n;
      } else {
        fromBlock = params?.fromBlock;
      }
      const toBlock = params?.toBlock ?? 'latest';
      const { hash, event, args } = params ?? {};

      let result: unknown;

      if (hash) {
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 0 });
        if (receipt.status === 'reverted') throw new Error(`Transaction ${hash} reverted`);
        result = parseEventLogs({
          abi: abi as Abi,
          logs: receipt.logs,
          ...(event !== undefined ? { eventName: event as any } : {}),
        });
      } else if (Array.isArray(event)) {
        const abiEvents = event.map(findAbiEvent).filter((e): e is AbiEvent => e !== undefined);
        result = await client.getLogs({ address: enhanced.address, events: abiEvents, fromBlock, toBlock });
      } else {
        const abiEvent = event ? findAbiEvent(event) : undefined;
        result = abiEvent
          ? await client.getLogs({ address: enhanced.address, event: abiEvent, args: args as Record<string, unknown>, fromBlock, toBlock })
          : await client.getLogs({ address: enhanced.address, fromBlock, toBlock });
      }

      return result as ParseEventLogsReturnType<TAbi>;
    };

    (enhanced as any).getLogs = getLogsFn;
  }

  return enhanced;
}

// ── withSafeWrite ─────────────────────────────────────────────────────────────
// Base feature: simulate before call. No Safe wallet (Gnosis), no cast mode.

export function withSafeWrite<const TAbi extends Abi, C extends ExtendedClient>(
  contract: EnhancedContract<TAbi, C>,
  abi: TAbi,
  client: C,
  confirmations = 1,
): SafeEnhancedContract<TAbi, C> {
  if ('write' in contract) {
    // Proxy contract.write to add receipt waiting and log parsing
    const writeHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop) {
        const fn = (target as any)[prop];
        if (typeof fn !== 'function') return fn;
        return async (args: any, options: any) => {
          try {
            const hash = await fn(args, { chain: null, account: (client as any).account, ...options });
            const sig = `${contract.name}.${prop as string}(${args?.join ? args.join(', ') : args})`;
            logger.addData('txs', { to: contract.address, invocation: sig, hash, options });
            if (!hash) throw new Error(`${sig} returned no transaction hash`);
            const receipt = await client.waitForTransactionReceipt({ hash, confirmations });
            if (receipt.status === 'reverted') {
              throw new Error(`Transaction ${sig} (hash: ${hash}) reverted, pls resend the transaction:\n` + JSON.stringify(receipt.logs, bigintReplacer));
            }
            const logs = parseEventLogs({ abi: abi as Abi, logs: receipt.logs });
            if (logs.length > 0) {
              logger.log('\nLogs emitted during the transaction:');
              logger.log(logs.map((log: any) => `  ${log.eventName}${JSON.stringify(log.args, bigintReplacer)}`).join('\n'));
              logger.log('');
              logger.addData('receipt', receipt);
            }
            return hash;
          } catch (error: any) {
            handleContractError(error, contract.name ?? 'unknown');
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
            handleContractError(error, contract.name ?? 'unknown');
          }
        };
      },
    });
  }

  return contract as unknown as SafeEnhancedContract<TAbi, C>;
}

// ── getContract ───────────────────────────────────────────────────────────────

export const getContract = async <const TAbi extends Abi, C extends ExtendedClient>(
  abi: TAbi,
  abiName: string,
  config: Config<C>,
  address?: Address,
  selectors?: readonly string[],
): Promise<C extends ExtendedWalletClient ? SafeEnhancedContract<TAbi, C> : EnhancedContract<TAbi, C>> => {
  const { client, wait = 0, skipAbiValidation = false } = config;
  const envVar = abiName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
  if (!address) {
    if (process.env[envVar]) address = process.env[envVar] as Address;
    else throw new Error(`Address is required to create a contract instance for ${abiName}. Please provide associated option or set as environment variable ${envVar}`);
  }
  if (!skipAbiValidation && selectors) {
    await contractAbiValidation(client, selectors, abiName, address);
  }
  const base = withMulticall(
    viemGetContract({ abi, address, client }) as GetContractReturnType<TAbi, C>,
    abi,
    abiName,
    client,
  );
  return withSafeWrite(base, abi, client, wait) as any;
  // as any: TypeScript cannot resolve the conditional return type from the implementation
};
