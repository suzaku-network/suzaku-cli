import { encodeFunctionData, getAddress, parseEventLogs, type Abi, type Hex, type ContractFunctionName } from 'viem';
import { type Address } from 'viem';
import { getContract as viemGetContract } from 'viem';
import {
  withSafeWrite as coreWithSafeWrite,
  withMulticall,
  contractAbiValidation,
  bigintReplacer,
  type EnhancedContract,
  type SafeEnhancedContract,
} from '../core/client/viemUtils';
import { type ExtendedWalletClient } from './client/types';
import { type ExtendedClient } from '../core/client/types';
import { nodeLogger as logger } from './nodeLogger';
import { color } from 'console-log-colors';
import { handleTransactionStrategy } from './client/safeUtils';
import { isCastMode, logCastCall, logCastSend, CAST_DUMMY_HASH } from './castUtils';

export * from '../core/client/viemUtils';
export { setCastMode, isCastMode } from './castUtils';

// ── handleContractError (node version — colored output) ───────────────────────

export function handleContractError(error: any, abiName: string): never {
  throw logger.formatError(
    error?.cause ?? error instanceof Error ? [`${abiName} ${error.cause ?? error}`] : [error],
    3,
  );
}

// ── withGnosisSafe ────────────────────────────────────────────────────────────
// Wraps contract.write to add Gnosis Safe routing (new / confirm / propose / skip).
// Must be applied AFTER core withSafeWrite so receipt waiting is already in place
// for the non-Safe path (delegated to the core-proxied write).
// Also overrides contract.safeWrite to simulate from the Safe's address.

export function withGnosisSafe<const TAbi extends Abi, C extends ExtendedWalletClient>(
  contract: SafeEnhancedContract<TAbi, C>,
  abi: TAbi,
  abiName: string,
  client: C,
  confirmations = 1,
): SafeEnhancedContract<TAbi, C> {
  if (!('write' in contract) || !('safe' in client)) return contract;

  const gnosisWriteHandler: ProxyHandler<Record<string, any>> = {
    get(target, prop) {
      const fn = (target as any)[prop];
      if (typeof fn !== 'function') return fn;
      return async (args: any, options: any) => {
        if (!client.safe) return fn(args, options); // delegate to core-proxied write

        const transaction = {
          to: contract.address,
          data: encodeFunctionData({ abi: abi as Abi, functionName: prop as string, args }),
          chain: null,
          account: client.account,
          ...options,
          value: options?.value ?? '0',
        };

        const selection = await handleTransactionStrategy(
          transaction,
          client.safe,
          abi as Abi,
          (client as ExtendedWalletClient).addresses.C,
        );

        let hash: Hex;
        switch (selection.action) {
          case 'new':
            logger.debug('Sending a new Safe transaction as owner');
            hash = (await client.safe.send({ transactions: [transaction] })).transactions?.ethereumTxHash as Hex;
            break;
          case 'confirm':
            logger.debug('Confirming a Safe transaction as owner');
            hash = (await client.safe.confirm({ safeTxHash: selection.hash! })).transactions?.ethereumTxHash as Hex;
            break;
          case 'propose': {
            logger.debug('Proposing a Safe transaction as delegate');
            const safeTransaction = await client.safe.protocolKit.createTransaction({ transactions: [transaction] });
            const safeTxHash = await client.safe.protocolKit.getTransactionHash(safeTransaction);
            const signature = await client.safe.protocolKit.signHash(safeTxHash);
            await client.safe.apiKit.proposeTransaction({
              safeAddress: await client.safe.getAddress(),
              safeTransactionData: safeTransaction.data,
              safeTxHash,
              senderAddress: getAddress(client.addresses.C),
              senderSignature: signature.data,
            });
            hash = selection.hash!;
            break;
          }
          default:
            logger.debug('Skipping a Safe transaction');
            return CAST_DUMMY_HASH;
        }

        if (!hash) throw new Error(`Safe transaction returned no hash for ${contract.name}.${prop as string}`);

        const sig = `${contract.name}.${prop as string}(${args?.join ? args.join(', ') : args})`;
        logger.addData('txs', { to: contract.address, invocation: sig, hash, options });
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations });
        if (receipt.status === 'reverted') {
          throw logger.formatError([`Transaction ${color.red(sig)} (hash: ${hash}) reverted:\n` + JSON.stringify(receipt.logs, bigintReplacer)], 3);
        }
        const logs = parseEventLogs({ abi: abi as Abi, logs: receipt.logs });
        if (logs.length > 0) {
          logger.log('\nLogs emitted during the transaction:');
          logger.log(logs.map((log: any) => `  ${color.magenta(log.eventName)}${JSON.stringify(log.args, bigintReplacer)}`).join('\n'));
          logger.log('');
          logger.addData('receipt', receipt);
        }
        return hash;
      };
    },
  };

  (contract as any).write = new Proxy((contract as any).write as Record<string, any>, gnosisWriteHandler);

  // Override safeWrite to simulate from Safe's address when safe is present
  (contract as any).safeWrite = new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      return async (args: any, options: any) => {
        try {
          const simulateFn = (contract as any).simulate?.[prop];
          if (typeof simulateFn === 'function') {
            const simulateOptions = client.safe
              ? { ...options, account: await client.safe.getAddress() }
              : options;
            await simulateFn(args, simulateOptions);
          }
          return await (contract as any).write[prop as string](args, options);
        } catch (error: any) {
          handleContractError(error, abiName);
        }
      };
    },
  });

  return contract;
}

// ── withCastMode ──────────────────────────────────────────────────────────────
// Outermost wrapper: intercepts write and read in cast mode to log cast commands.

export function withCastMode<const TAbi extends Abi, C extends ExtendedClient>(
  contract: SafeEnhancedContract<TAbi, C>,
  abi: TAbi,
  client: C,
): SafeEnhancedContract<TAbi, C> {
  if ('write' in contract) {
    (contract as any).write = new Proxy((contract as any).write as Record<string, any>, {
      get(target, prop) {
        const fn = (target as any)[prop];
        if (typeof fn !== 'function') return fn;
        return async (args: any, options: any) => {
          if (isCastMode()) {
            const rpcUrl = client.chain?.rpcUrls?.default?.http?.[0];
            logCastSend(contract.name, contract.address, abi as any, prop as string, Array.isArray(args) ? args : args != null ? [args] : [], rpcUrl, options);
            return CAST_DUMMY_HASH;
          }
          return fn(args, options);
        };
      },
    });
  }

  if ('read' in contract) {
    (contract as any).read = new Proxy((contract as any).read as Record<string, any>, {
      get(target, prop) {
        const fn = (target as any)[prop];
        if (typeof fn !== 'function') return fn;
        return async (...args: any[]) => {
          if (isCastMode()) {
            const rpcUrl = client.chain?.rpcUrls?.default?.http?.[0];
            logCastCall(contract.name, contract.address, abi as any, prop as string, args, rpcUrl);
          }
          return fn(...args);
        };
      },
    });
  }

  return contract;
}

// ── getContract (node — composes core + Gnosis + cast mode) ──────────────────

export const getContract = async <const TAbi extends Abi, C extends ExtendedClient>(
  abi: TAbi,
  abiName: string,
  client: C,
  address?: Address,
  selectors?: readonly string[],
): Promise<C extends ExtendedWalletClient ? SafeEnhancedContract<TAbi, C> : EnhancedContract<TAbi, C>> => {
  const { wait = 0, skipAbiValidation = false } = client;
  const envVar = abiName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
  if (!address) {
    if (process.env[envVar]) address = process.env[envVar] as Address;
    else throw new Error(`Address is required to create a contract instance for ${abiName}. Please provide associated option or set as environment variable ${envVar}`);
  }
  if (!skipAbiValidation && selectors) {
    await contractAbiValidation(client, selectors, abiName, address);
  }

  const base = withMulticall(
    viemGetContract({ abi, address, client }) as any,
    abi,
    abiName,
    client,
  );
  const withSW = coreWithSafeWrite(base, abi, client, wait);
  const withGS = 'safe' in client
    ? withGnosisSafe(withSW as any, abi, abiName, client as unknown as ExtendedWalletClient, wait)
    : withSW;
  return withCastMode(withGS as SafeEnhancedContract<TAbi, C>, abi, client) as any;
};

// ── fromContract ──────────────────────────────────────────────────────────────
// Maps an EnhancedContract to any interface T:
//   - "xyzBatch" keys → contract.multicall with function name "xyz"
//   - other keys     → contract.read[key] or contract.safeWrite[key]
//
// TypeScript verifies that all required function names exist in the ABI:
//   - non-batch keys of T must be ContractFunctionName<TAbi>
//   - base names of "XxxBatch" keys must be ContractFunctionName<TAbi>

type NonBatchKeys<T> = { [K in keyof T & string]: K extends `${string}Batch` ? never : K }[keyof T & string];
type BatchBaseNames<T> = { [K in keyof T & string]: K extends `${infer B}Batch` ? B : never }[keyof T & string];
type RequiredFnNames<T> = NonBatchKeys<T> | BatchBaseNames<T>;

type ContractAccessor = {
  read?: Record<string, (...args: readonly unknown[]) => Promise<unknown>>;
  safeWrite?: Record<string, (...args: readonly unknown[]) => Promise<Hex>>;
  multicall: (items: readonly { name: string; args: readonly unknown[] }[]) => Promise<readonly unknown[]>;
};

export function fromContract<T, TAbi extends Abi, C extends ExtendedClient>(
  contract: [RequiredFnNames<T>] extends [ContractFunctionName<TAbi>]
    ? EnhancedContract<TAbi, C>
    : never
): T;
export function fromContract<T, TAbi extends Abi, C extends ExtendedClient>(
  contract: EnhancedContract<TAbi, C>
): T {
  const c = contract as unknown as ContractAccessor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({} as any, {
    get(_, prop: string | symbol): unknown {
      if (typeof prop !== 'string') return undefined;
      if (prop.endsWith('Batch')) {
        const fnName = prop.slice(0, -5);
        return (argsBatch: readonly (readonly unknown[])[]) =>
          c.multicall(argsBatch.map(args => ({ name: fnName, args })));
      }
      if (c.read && prop in c.read) return c.read[prop];
      if (c.safeWrite && prop in c.safeWrite) return c.safeWrite[prop];
    },
  }) as T;
}
