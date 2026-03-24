import { getContract, GetContractReturnType, Address, parseEventLogs, Hex, encodeFunctionData, Abi, getAddress, ContractFunctionName, ContractFunctionArgs, ContractFunctionReturnType, ContractFunctionExecutionError } from 'viem';
import { SuzakuABI } from '../abis';
import { ExtendedClient, ExtendedWalletClient } from '../client';
import { logger } from './logger';
import { bigintReplacer, bytes32ToAddress } from './utils';
import { color } from 'console-log-colors';
import { handleTransactionStrategy } from './safeUtils';
import AllSelectors from '../abis/abi-selectors.json';
import AhoCorasick from 'modern-ahocorasick'
import { isCastMode, logCastCall, logCastSend } from './castUtils';

export { setCastMode, isCastMode } from './castUtils';

// Define the type for the Suzaku ABI
export type SuzakuABINames = keyof typeof SuzakuABI;
export type TSuzakuABI = { [K in SuzakuABINames]: typeof SuzakuABI[K] };

// Utility type to make 'account' optional in write function options
// Also makes 'args' optional when the function has no input parameters
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

// Define the type for the contract instances
export type SuzakuContract = { [K in SuzakuABINames]: MakeAccountOptionalInWrite<GetContractReturnType<typeof SuzakuABI[K], ExtendedClient>> & { address: Hex, name: string, multicall: MulticallFn<K> } };

// Define the type to use the same signature write methods of each contract
export type TWriteSuzakuContract = { [K in SuzakuABINames]: SuzakuContract[K] extends { write: infer W } ? W : never };

// Define the type for the safe contract instances that include a safeWrite method
export type SafeSuzakuContract = { [K in SuzakuABINames]: SuzakuContract[K] & { safeWrite: TWriteSuzakuContract[K] } };

// Multicall Types
// Extract read function names from a contract ABI
type ReadFunctionNames<T extends SuzakuABINames> = ContractFunctionName<typeof SuzakuABI[T], 'view' | 'pure'>;

// Check if a function has required arguments (args length > 0)
type HasArgs<T extends SuzakuABINames, FName extends ReadFunctionNames<T>> =
  ContractFunctionArgs<typeof SuzakuABI[T], 'view' | 'pure', FName> extends readonly [] ? false : true;

// Multicall input item: string for no-args functions, {name, args} for functions with args
type MulticallItem<T extends SuzakuABINames, FName extends ReadFunctionNames<T> = ReadFunctionNames<T>> =
  FName extends ReadFunctionNames<T>
  ? HasArgs<T, FName> extends true
  ? { name: FName; args: ContractFunctionArgs<typeof SuzakuABI[T], 'view' | 'pure', FName> }
  : FName | { name: FName }
  : never;

// Extract function name from a MulticallItem
type ExtractFunctionName<T extends SuzakuABINames, Item> =
  Item extends string ? Item :
  Item extends { name: infer N } ? N extends ReadFunctionNames<T> ? N : never :
  never;

// Result type for a single multicall item
type MulticallItemResult<T extends SuzakuABINames, Item> =
  ExtractFunctionName<T, Item> extends ReadFunctionNames<T>
  ? ContractFunctionReturnType<typeof SuzakuABI[T], 'view' | 'pure', ExtractFunctionName<T, Item>>
  : never;

// Map over array of items to get result types (detailed version with name and result)
type MulticallResultsDetailed<T extends SuzakuABINames, Items extends readonly MulticallItem<T>[]> = {
  [K in keyof Items]: {
    name: ExtractFunctionName<T, Items[K]>;
    result: MulticallItemResult<T, Items[K]>;
  }
};

// Map over array of items to get simple result types (just the return value)
type MulticallResultsSimple<T extends SuzakuABINames, Items extends readonly MulticallItem<T>[]> = {
  [K in keyof Items]: MulticallItemResult<T, Items[K]>
};

interface MulticallOptions<D extends boolean = false, S extends boolean = true> {
  strict?: S, // If true, throw an error if any of the calls fail
  details?: D, // If true, return the details of each call, otherwise return only the results
}

// The multicall function signature with conditional return type based on details option
type MulticallFn<T extends SuzakuABINames> = {
  <const Items extends readonly MulticallItem<T>[], D extends boolean = false, S extends boolean = true>(
    items: Items,
    options?: MulticallOptions<D, S>
  ): Promise<D extends true ? MulticallResultsDetailed<T, Items> : MulticallResultsSimple<T, Items>>;
};

// Define a curried function to create a contract instance progressively (generic to keep type inference)
export type CurriedContractFn<T extends SuzakuABINames, C extends ExtendedClient> = (address?: Address, _skipAbiValidation?: boolean) => Promise<C extends ExtendedWalletClient ? SafeSuzakuContract[T] : SuzakuContract[T]>;
export type CurriedSuzakuContractMap<C extends ExtendedClient> = { [key in SuzakuABINames]: CurriedContractFn<key, C> }

function handleContractError(error: any, abi: SuzakuABINames) {
  if (error instanceof ContractFunctionExecutionError) {
    throw Error(`${abi} ${error.cause}`)
  } else if (error instanceof Error) {
    const eraseToIndex = error.message.indexOf("Docs:")
    if (eraseToIndex === -1) throw error;
    throw Error(`${abi} ${error.message.slice(0, eraseToIndex - 1)}`)
  } else if (error instanceof Object) {
    const eraseToIndex = error.message.indexOf("Docs:")
    if (eraseToIndex === -1) throw error;
    throw Error(`${abi} ${error.message.slice(0, eraseToIndex - 1)}`)
  } else {
    throw error
  }
}

// Map a proxy handler on safeWrite methods of the contract to simulate the write operation before executing it
export function withSafeWrite<T extends SuzakuABINames>(
  contract: SuzakuContract[T],
  abi: T,
  client: ExtendedClient,
  confirmations = 1
): SafeSuzakuContract[T] {

  // Introspection
  contract.name = abi;

  if ('write' in contract) {

    // Proxy handler for write methods to add Safe transaction handling and wait for confirmations
    const writeHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop,) {
        const fn = (target as any)[prop]
        if (typeof fn !== 'function') return fn
        return async (args: any, options: any) => {
          try {
            // ── Cast mode: log the equivalent cast send command and skip execution
            if (isCastMode()) {
              const rpcUrl = client.chain?.rpcUrls?.default?.http?.[0];
              logCastSend(contract.name, contract.address, SuzakuABI[abi] as any, prop as string, Array.isArray(args) ? args : args != null ? [args] : [], rpcUrl, options);
              return undefined;
            }
            let hash: Hex;
            // If a safe smart account is connected, use it to send the transaction
            if ("safe" in client && client.safe != undefined) {
              const transaction = {
                to: contract.address,
                data: encodeFunctionData({
                  abi: SuzakuABI[abi] as Abi,
                  functionName: prop as string,
                  args
                }),
                chain: null,
                account: client.account!,
                ...options,
                value: options?.value ? options.value : '0',
              }

              const selection = await handleTransactionStrategy(transaction, client.safe, SuzakuABI[abi] as Abi, client.account!.address as Hex)
              switch (selection.action) {
                case 'new':
                  logger.debug(`Sending a new Safe transaction as owner`)
                  hash = (await client.safe.send({ transactions: [transaction] })).transactions?.ethereumTxHash as Hex;
                  break;
                case 'confirm':
                  logger.debug(`Confirming a Safe transaction as owner`)
                  hash = (await client.safe.confirm({ safeTxHash: selection.hash! })).transactions?.ethereumTxHash as Hex;
                  break;
                case 'propose':
                  logger.debug(`Proposing a Safe transaction as delegate`)
                  const safeTransaction = await client.safe.protocolKit.createTransaction({
                    transactions: [transaction]
                  })
                  const safeTxHash = await client.safe.protocolKit.getTransactionHash(safeTransaction)
                  const signature = await client.safe.protocolKit.signHash(safeTxHash)
                  await client.safe.apiKit.proposeTransaction({
                    safeAddress: await client.safe.getAddress(),
                    safeTransactionData: safeTransaction.data,
                    safeTxHash,
                    senderAddress: getAddress(client.account!.address),
                    senderSignature: signature.data
                  })
                  hash = selection.hash!;
                  break;
                default:// same as skip
                  logger.debug(`Skipping a Safe transaction`)
                  hash = selection.hash!;
              }
            } else {
              hash = await fn(args, { chain: null, account: client.account!, ...options })
            }
            const sig = `${contract.name}.${prop as string}(${args.join ? args.join(', ') : args})`
            logger.addData('txs', { to: contract.address, invocation: sig, hash, options });

            if (!hash) return undefined; // when skipping

            const receipt = await client.waitForTransactionReceipt({ hash, confirmations })
            if (receipt.status === 'reverted') throw new Error(`Transaction ${color.red(sig)} (hash: ${hash}) reverted, pls resend the transaction:\n` + JSON.stringify(receipt.logs, bigintReplacer));

            const logs = parseEventLogs({
              abi: SuzakuABI[abi],
              logs: receipt.logs,
            });
            if (logs.length > 0) {
              logger.log("\nLogs emitted during the transaction:");
              logger.log(logs.map((log: any) => {
                return `  ${color.magenta(log.eventName)}${JSON.stringify(log.args, bigintReplacer)}`;
              }).join('\n'));
              logger.log("");
              logger.addData('receipt', receipt);
            }
            return hash
          } catch (error: any) {
            handleContractError(error, abi)
          }
        }
      },
    };
    
    (contract as any).write = new Proxy(contract.write as Record<string, any>, writeHandler);

    // Proxy handler for safeWrite methods to simulate the write operation before executing it
    const safeWriteHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop,) {
        const fn = (target as any)[prop]
        if (typeof fn !== 'function') return fn
        return async (args: any, options: any) => {
          try {
            // Skip simulation in cast mode — the write handler will log the command
            if (!isCastMode()) {
              const simulateFn = (contract as any).simulate?.[prop]
              if (typeof simulateFn === 'function') {
                // If any safe is connected, use its address to simulate the transaction
                await simulateFn(args, "safe" in client && client.safe != undefined ? { ...options, account: await client.safe.getAddress() } : options)
              }
            }
            return await fn(args, options)
          } catch (error: any) {
            handleContractError(error, abi)
          }
        }
      },
    };

    (contract as any).safeWrite = new Proxy(contract.write as Record<string, any>, safeWriteHandler);
  }

  return contract as unknown as SafeSuzakuContract[T];
}

// Map a proxy handler on safeWrite methods of the contract to simulate the write operation before executing it
export function withMulticall<T extends SuzakuABINames>(
  contract: SuzakuContract[T],
  abi: T,
  client: ExtendedClient,
): SuzakuContract[T] {

  // Introspection
  contract.name = abi;
if ('read' in contract) {

  // Proxy handler for read methods to catch and format errors
  const readHandler: ProxyHandler<Record<string, any>> = {
    get(target, prop,) {
      const fn = (target as any)[prop]
      if (typeof fn !== 'function') return fn
      return async (...args: any[]) => {
        try {
          if (isCastMode()) {
            const rpcUrl = client.chain?.rpcUrls?.default?.http?.[0];
            logCastCall(contract.name, contract.address, SuzakuABI[abi] as any, prop as string, args, rpcUrl);
          }
          const result = await fn(...args)
          const functionSignature = `${contract.name}.${prop as string}(${args.join ? args.join(', ') : args})`
          logger.addData('receipt', { functionSignature, result });
          return result
        } catch (error: any) {
          handleContractError(error, abi)
        }
      }
    },
  };

  (contract as any).read = new Proxy(contract.read as Record<string, any>, readHandler);

  // Multicall implementation for batching read operations
  (contract as any).multicall = async (items: Array<string | { name: string; args?: readonly unknown[] }>, options?: MulticallOptions) => {
    const contracts = items.map((item) => {
      const functionName = typeof item === 'string' ? item : item.name;
      const args = typeof item === 'object' && 'args' in item ? item.args : [];
      return {
        address: contract.address,
        abi: SuzakuABI[abi] as Abi,
        functionName,
        args,
      };
    });

    if (isCastMode()) {
      const rpcUrl = client.chain?.rpcUrls?.default?.http?.[0];
      for (const c of contracts) {
        logCastCall(contract.name, c.address, c.abi, c.functionName, c.args as unknown[] ?? [], rpcUrl);
      }
    }

    const results = await client.multicall({ contracts: contracts as any });

    return results.map((result, index) => {
      const item = items[index];
      const name = typeof item === 'string' ? item : item.name;
      if (result.status === 'failure') {
        if (options?.strict) {
          throw new Error(`Multicall failed for ${name}: ${result.error}`);
        }
        logger.warn(`Multicall failed for ${name}: ${result.error}`);
      }
      return options?.details ? {
        name,
        result: result.status === 'success' ? result.result : undefined,
        args: typeof item === 'object' && 'args' in item ? item.args : [],
      } : result.result;
    });
  };

}
return contract as unknown as SuzakuContract[T];
}

export const curriedContract = <T extends SuzakuABINames, C extends ExtendedClient>(abi: T, client: C, wait = 0, skipAbiValidation: boolean = false): CurriedContractFn<T, C> =>
  async (address?: Address, _skipAbiValidation: boolean = skipAbiValidation) => {
    // format camelCase ABI name to SCREAMING_SNAKE_CASE for env var lookup
    const envVar = abi.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
    if (!address) {
      if (process.env[envVar]) address = process.env[envVar] as Address;
      else throw new Error(`Address is required to create a contract instance for ${abi}. Please provide associated option or set as environment variable ${envVar}`);
    }
    if (!_skipAbiValidation) {
      // (StakingVault uses delegatecall to forward to operations implementation)
      // Skip ABI validation since functions are forwarded via fallback
      if (abi.includes("StakingVault")) {
        await contractAbiValidation(client, ["StakingVault"], address);
      } else {
        await contractAbiValidation(client, [abi], address);
      }
    }
    const contract = withMulticall(getContract({
      abi: SuzakuABI[abi],
      address,
      client,
    }) as SuzakuContract[T], abi, client);
    return withSafeWrite(
      contract,
      abi,
      client,
      wait
    )
  };

export async function contractAbiValidation<T extends SuzakuABINames>(client: ExtendedClient, abis: T[], address: Address): Promise<{ name: T, ratio: number, valid: boolean }[]> {
  // Tolerance for missing selectors 6%
  const TOLERANCE = 0.06;
  // Check for proxy
  const proxyImplementation = await client.getStorageAt({
    address,
    slot: '0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC' // EIP-1967 implementation slot
  });
  if (proxyImplementation !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    address = bytes32ToAddress(proxyImplementation as `0x${string}`);
    logger.debug(`Detected proxy contract. Using implementation at address ${address} for ABI validation.`);
  }

  let contractByteCode = await client.getCode({ address })
  if (!contractByteCode || contractByteCode === '0x') {
    logger.exitError([`No contract found at address ${address} for ABIs ${abis.join(', ')}`], 3);
    return [];
  }

  // Check for EIP-1167 minimal proxy
  if (contractByteCode.startsWith('0x363d3d373d3d3d363d73') && contractByteCode.endsWith('5af43d82803e903d91602b57fd5bf3')) {
    const implementationAddress = '0x' + contractByteCode.slice(22, 62);
    logger.debug(`Detected EIP-1167 minimal proxy. Using implementation at address ${implementationAddress} for ABI validation.`);
    contractByteCode = await client.getCode({ address: implementationAddress as Address });
    if (!contractByteCode || contractByteCode === '0x') {
      logger.exitError([`No contract found at address ${address} for ABIs ${abis.join(', ')}`], 3);
      return [];
    }
  }

  // Validate ABI by checking that all function selectors are present in the bytecode
  const ACs: [AhoCorasick, number][] = abis.map((abi) => {
    const selectors = (AllSelectors as Record<string, string[]>)[abi];
    if (!selectors) {
      logger.warn(`No selectors found for ABI ${abi}, skipping validation`);
      return [new AhoCorasick([]), 0];
    }
    return [new AhoCorasick(selectors), Object.keys(selectors).length];
  });// Use Aho-Corasick algorithm for multi-pattern search (perf)

  const missingRatio = ACs.map(([ac, selectorCount]) => {
    const matches = new Set(ac.search(contractByteCode).map(m => m[1][0])); // get only the matched selectors
    // Validation
    const missingCount = selectorCount - matches.size;
    return [missingCount, missingCount / selectorCount, matches] as [number, number, Set<string>];
  })

  const result = missingRatio.reduce((acc, [missingCount, ratio, matches], i) => {
    if (ratio > 0) {
      const selectors = (AllSelectors as Record<string, string[]>)[abis[i]];
      logger.debug(`ABI validation for contract ${abis[i]} at address ${address}: ${matches.size} selectors matched, ${missingCount} missing (${(ratio * 100).toFixed(2)}% missing)`);
      if (selectors) {
        logger.debug(`Missing selectors: ${selectors.filter((s: string) => !matches.has(s)).join(', ')}`);
      }
    }
    return [...acc, { name: abis[i], ratio, valid: ratio < TOLERANCE }]
  }, [] as { name: T, ratio: number, valid: boolean }[])

  if (result.every(r => !r.valid)) {
    logger.exitError([`The contract at address ${address} does not match the expected ABI for ${abis.join(', ')} contract.`], 3)
  }
  return result;
}
