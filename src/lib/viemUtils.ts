import { getContract, PublicClient, GetContractReturnType, Address, WalletClient } from 'viem';
import { SuzakuABI } from '../abis';
import { exit } from 'process';
import { ExtendedClient } from '../client';

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
  contract: SuzakuContracts[T]
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
            // console.log(`Simulating ${String(prop)}`);
            await simulateFn(...args)
          }
          // console.log(`Executing ${String(prop)}`);
          return fn(...args)
        } catch (error: any) {
          console.log(error.message)
          exit(1)
        }
      }
    },
  };

  (contract as any).safeWrite = new Proxy(contract.write as Record<string, any>, handler);

  return contract as unknown as SafeSuzakuContract[T];
}

// Map a proxy handler on write methods of the contract to wait for transaction receipt after executing it
export function withWaitForReceipt<T extends SuzakuABINames>(
  contract: SuzakuContracts[T],
  client: ExtendedClient,
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
          if (receipt.status === 'reverted') throw new Error(`Transaction ${hash} reverted, pls resend the transaction`);
          return hash
        } catch (error: any) {
          console.log(error.message)
          exit(1)
        }
      }
    },
  };

  (contract as any).write = new Proxy(contract.write as Record<string, any>, handler);

  return contract as unknown as SuzakuContracts[T];
}

export const curriedContract = <T extends SuzakuABINames>(abi: T, client: ExtendedClient, wait = 0): CurriedContractFn<T> =>
  (address: Address) =>
  {
    let contract = getContract({
      abi: SuzakuABI[abi],
      address,
      client,
    }) as SuzakuContracts[T];
    if (wait > 0) {
      contract = withWaitForReceipt(
        contract,
        client,
        wait
      )
    }
    return withSafeWrite(
      contract
    )
  };
