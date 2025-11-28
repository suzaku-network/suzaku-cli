import { getContract, GetContractReturnType, Address, parseEventLogs, Hex, encodeFunctionData, Abi } from 'viem';
import { SuzakuABI } from '../abis';
import { ExtendedClient } from '../client';
import { logger } from './logger';
import { bigintReplacer, bytes32ToAddress } from './utils';
import { color } from 'console-log-colors';
import { handleTransactionStrategy } from './safeUtils';
import AllSelectors from '../abis/abi-selectors.json';
import AhoCorasick from 'modern-ahocorasick'

// Define the type for the Suzaku ABI
export type SuzakuABINames = keyof typeof SuzakuABI;
export type TSuzakuABI = { [K in SuzakuABINames]: typeof SuzakuABI[K] };

// Define the type for the contract instances
export type SuzakuContracts = { [K in SuzakuABINames]: GetContractReturnType<typeof SuzakuABI[K], ExtendedClient> & { address: Hex, name: string } };

// Define the type to use the same signature write methods of each contract
export type TWriteSuzakuContract = { [K in SuzakuABINames]: SuzakuContracts[K] extends { write: infer W } ? W : never };

// Define the type for the safe contract instances that include a safeWrite method
export type SafeSuzakuContract = { [K in SuzakuABINames]: SuzakuContracts[K] & { safeWrite: TWriteSuzakuContract[K] } };

// Define a curried function to create a contract instance progressively (generic to keep type inference)
export type CurriedContractFn<T extends SuzakuABINames> = (address: Address) => Promise<SafeSuzakuContract[T]>;
export type CurriedSuzakuContractMap = { [key in SuzakuABINames]: CurriedContractFn<key> }

// Map a proxy handler on safeWrite methods of the contract to simulate the write operation before executing it
export function withSafeWrite<T extends SuzakuABINames>(
  contract: SuzakuContracts[T],
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
                ...options,
                value: options?.value ? options.value : '0',
              }
              const selection = await handleTransactionStrategy(transaction, client.safe, SuzakuABI[abi] as Abi, client.account!.address as Hex)
              switch (selection.action) {
                case 'new':
                  hash = (await client.safe.send({ transactions: [transaction] })).transactions?.ethereumTxHash as Hex;
                  break;
                case 'confirm':
                  hash = (await client.safe.confirm({ safeTxHash: selection.hash! })).transactions?.ethereumTxHash as Hex;
                  break;
                default:// same as skip
                  hash = selection.hash!;
              }
            } else {
              hash = await fn(args, options)
            }

            logger.addData('txs', { to: contract.address, invocation: `${contract.name}.${prop as string}(${args.join(', ')})`, hash, options });

            if (!hash) return undefined; // when skipping

            const receipt = await client.waitForTransactionReceipt({ hash, confirmations })
            if (receipt.status === 'reverted') throw new Error(`Transaction ${hash} reverted, pls resend the transaction:\n` + receipt.logs);

            const logs = parseEventLogs({
              abi: SuzakuABI[abi],
              logs: receipt.logs,
            });
            if (logs.length > 0) {
              logger.log("\nLogs emitted during the transaction:");
              logger.log(logs.map((log) => {
                return `  ${color.magenta(log.eventName)}${JSON.stringify(log.args, bigintReplacer)}`;
              }).join('\n'));
              logger.log("");
              logger.addData('receipt', receipt);
            }
            return hash
          } catch (error: any) {
            const msg = (error.message as string)
            const eraseToIndex = msg.indexOf("Docs:")
            logger.exitError([`${abi}:\n\n${eraseToIndex === -1 ? (error as Error) : msg.slice(0, eraseToIndex - 1)}`], 2)
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
            const simulateFn = (contract as any).simulate?.[prop]
            if (typeof simulateFn === 'function') {
              // If any safe is connected, use its address to simulate the transaction
              await simulateFn(args, "safe" in client && client.safe != undefined ? { ...options, account: await client.safe.getAddress() } : options)
            }
            return await fn(args, options)
          } catch (error: any) {
            const msg = (error.message as string)
            const eraseToIndex = msg.indexOf("Docs:")
            logger.exitError([`${abi}:\n\n${msg.slice(0, eraseToIndex - 1)}`], 2)
          }
        }
      },
    };

    (contract as any).safeWrite = new Proxy(contract.write as Record<string, any>, safeWriteHandler);
  }

  if ('read' in contract) {

    // Proxy handler for read methods to catch and format errors
    const readHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop,) {
        const fn = (target as any)[prop]
        if (typeof fn !== 'function') return fn
        return async (...args: any[]) => {
          try {
            return await fn(...args)
          } catch (error: any) {
            const msg = (error.message as string)
            const eraseToIndex = msg.indexOf("Docs:")
            logger.exitError([`${abi}:\n\n${msg.slice(0, eraseToIndex - 1)}`], 2)
          }
        }
      },
    };

    (contract as any).read = new Proxy(contract.read as Record<string, any>, readHandler);

  }

  return contract as unknown as SafeSuzakuContract[T];
}

export const curriedContract = <T extends SuzakuABINames>(abi: T, client: ExtendedClient, wait = 0, skipAbiValidation: boolean = false): CurriedContractFn<T> =>
  async (address: Address) => {
    if (!skipAbiValidation) await contractAbiValidation(client, abi, address);
    const contract = getContract({
      abi: SuzakuABI[abi],
      address,
      client,
    }) as SuzakuContracts[T];
    return withSafeWrite(
      contract,
      abi,
      client,
      wait
    )
  };

async function contractAbiValidation<T extends SuzakuABINames>(client: ExtendedClient, abi: T, address: Address): Promise<boolean | undefined> {
  // Tolerance for missing selectors 5%
  const TOLERANCE = 0.05;
  // Check for proxy
  const proxyImplementation = await client.getStorageAt({
    address,
    slot: '0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC' // EIP-1967 implementation slot
  });
  if (proxyImplementation !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    address = bytes32ToAddress(proxyImplementation as `0x${string}`);
    logger.log(`Detected proxy contract. Using implementation at address ${address} for ABI validation.`);
  }
  // Validate ABI by checking that all function selectors are present in the bytecode
  const ac = new AhoCorasick(AllSelectors[abi])// Use Aho-Corasick algorithm for multi-pattern search (perf)
  const contractByteCode = await client.getCode({ address })
  if (!contractByteCode || contractByteCode === '0x') {
    logger.exitError([`No contract found at address ${address} for ABI ${abi}`], 3);
    return false;
  }
  const matches = new Set(ac.search(contractByteCode).map(m => m[1][0])); // get only the matched selectors
  // Validation
  const missingCount = Object.keys(AllSelectors[abi]).length - matches.size;
  const missingRatio = missingCount / Object.keys(AllSelectors[abi]).length;
  const result = missingRatio <= TOLERANCE;

  if (missingRatio > 0) {
    logger.warn(`ABI validation for contract ${abi} at address ${address}: ${matches.size} selectors matched, ${missingCount} missing (${(missingRatio * 100).toFixed(2)}% missing)`);
    logger.log(`Missing selectors: ${AllSelectors[abi].filter(s => !matches.has(s)).join(', ')}`);
  }

  if (!result) {
    logger.exitError([`The contract at address ${address} does not match the expected ABI for ${abi} contract.`], 3)
  }
  return true;
}
