import { getContract, GetContractReturnType, Address, parseEventLogs, Hex, encodeFunctionData, Abi, decodeFunctionData } from 'viem';
import { SuzakuABI } from '../abis';
import { ExtendedClient } from '../client';
import { logger } from './logger';
import { bigintReplacer } from './utils';
import { color } from 'console-log-colors';
import { handleTransactionStrategy } from './safeUtils';

// Define the type for the Suzaku ABI
export type SuzakuABINames = keyof typeof SuzakuABI;
export type TSuzakuABI = { [K in SuzakuABINames]: typeof SuzakuABI[K] };

// Define the type for the contract instances
export type SuzakuContracts = { [K in SuzakuABINames]: GetContractReturnType<typeof SuzakuABI[K], ExtendedClient> & { address: Hex } };

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
  abi: T,
  client: ExtendedClient,
  confirmations = 1
): SafeSuzakuContract[T] {
  if (!('write' in contract)) {
    throw new Error('Contract does not have a write property');
  }

  const writeHandler: ProxyHandler<Record<string, any>> = {
    get(target, prop, _recv) {
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
                return (await client.safe.send({ transactions: [transaction] })).transactions?.ethereumTxHash as Hex;
              case 'confirm':
                return (await client.safe.confirm({ safeTxHash: selection.hash! })).transactions?.ethereumTxHash as Hex;
              default:// same as skip
                return undefined
            }
          } else {
            hash = await fn(args, options)
          }

          // If no confirmations required, return the hash directly
          if (confirmations === 0) return hash

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


  const safeWriteHandler: ProxyHandler<Record<string, any>> = {
    get(target, prop, _recv) {
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

export const curriedContract = <T extends SuzakuABINames>(abi: T, client: ExtendedClient, wait = 0): CurriedContractFn<T> =>
  (address: Address) => {
    let contract = getContract({
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
