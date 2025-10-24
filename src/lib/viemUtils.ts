import { getContract, PublicClient, GetContractReturnType, Address, WalletClient, parseEventLogs } from 'viem';
import { SuzakuABI } from '../abis';
import { exit } from 'process';
import { ExtendedClient } from '../client';
import { logger } from './logger';
import { bigintReplacer } from './utils';
import { color } from 'console-log-colors';

// Define the type for the Suzaku ABI
export type SuzakuABINames = keyof typeof SuzakuABI;
export type TSuzakuABI = { [K in SuzakuABINames]: typeof SuzakuABI[K] };

// Define the type for the contract instances
export type SuzakuContracts = { [K in SuzakuABINames]: GetContractReturnType<typeof SuzakuABI[K], ExtendedClient> };

// Define the type to use the same signature write methods of each contract
export type TWriteSuzakuContract = { [K in SuzakuABINames]: SuzakuContracts[K] extends { write: infer W } ? W : never };

// Define the type for the safe contract instances that include a safeWrite method
export type SafeSuzakuContract = { [K in SuzakuABINames]: SuzakuContracts[K] & { safeWrite: TWriteSuzakuContract[K] } };

// Define a curried function to create a contract instance progressively (generic to keep type inference)
export type CurriedContractFn<T extends SuzakuABINames> = (address: Address) => SafeSuzakuContract[T];
export type CurriedSuzakuContractMap = { [key in SuzakuABINames]: CurriedContractFn<key> }

// Map a proxy handler on safeWrite methods of the contract to simulate the write operation before executing it
export function withSafeWrite<T extends SuzakuABINames>(
  contract: SuzakuContracts[T],
  abi: T
): SafeSuzakuContract[T] {
  if (!('write' in contract)) {
    throw new Error('Contract does not have a write property');
  }
  const handler: ProxyHandler<Record<string, any>> = {
    get(target, prop, _recv) {
      const fn = (target as any)[prop]
      if (typeof fn !== 'function') return fn
      return async (...args: any[]) => {
        try {
          const simulateFn = (contract as any).simulate?.[prop]
          if (typeof simulateFn === 'function') {
            await simulateFn(...args)
          }
          return await fn(...args)
        } catch (error: any) {
          const msg = (error.message as string)
          const eraseToIndex = msg.indexOf("Docs:")
          logger.exitError([`${abi}:\n\n${msg.slice(0, eraseToIndex - 1)}`], 2)
        }
      }
    },
  };

  (contract as any).safeWrite = new Proxy(contract.write as Record<string, any>, handler);

  if (!('read' in contract)) {
    throw new Error('Contract does not have a read property');
  }
  const readHandler: ProxyHandler<Record<string, any>> = {
    get(target, prop, _recv) {
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

  return contract as unknown as SafeSuzakuContract[T];
}

// Map a proxy handler on write methods of the contract to wait for transaction receipt after executing it
export function withWaitForReceipt<T extends SuzakuABINames>(
  contract: SuzakuContracts[T],
  client: ExtendedClient,
  abi: T,
  confirmations = 1
): SuzakuContracts[T] {
  if (!('write' in contract)) {
    throw new Error('Contract does not have a write property');
  }
  const handler: ProxyHandler<Record<string, any>> = {
    get(target, prop, _recv) {
      const fn = (target as any)[prop]
      if (typeof fn !== 'function') return fn
      return async (...args: any[]) => {
        try {
          const hash = await fn(...args)
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
          logger.exitError([`${abi}:\n\n${msg.slice(0, eraseToIndex-1)}`], 2)
        }
      }
    },
  };

  (contract as any).write = new Proxy(contract.write as Record<string, any>, handler);

  return contract as unknown as SuzakuContracts[T];
}

export const curriedContract = <T extends SuzakuABINames>(abi: T, client: ExtendedClient, wait = 0): CurriedContractFn<T> =>
  (address: Address) => {
    let contract = getContract({
      abi: SuzakuABI[abi],
      address,
      client,
    }) as SuzakuContracts[T];
    if (wait > 0) {
      contract = withWaitForReceipt(
        contract,
        client,
        abi,
        wait
      )
    }
    return withSafeWrite(
      contract,
      abi
    )
  };
