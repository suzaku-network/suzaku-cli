import { encodeFunctionData, getAddress, parseEventLogs, type Abi, type Hex } from 'viem';
import { type Address } from 'viem';
import { SuzakuABI } from '../core/abis/index';
import { getContract } from 'viem';
import {
  withSafeWrite as coreWithSafeWrite,
  withMulticall,
  contractAbiValidation,
  bigintReplacer,
  type SuzakuABINames,
  type SuzakuContract,
  type SafeSuzakuContract,
  type CurriedContractFn,
} from '../core/viemUtils';
import { type ExtendedWalletClient } from './client/types';
import { type ExtendedClient } from '../core/client/types';
import { nodeLogger as logger } from './nodeLogger';
import { color } from 'console-log-colors';
import { handleTransactionStrategy } from './client/safeUtils';
import { isCastMode, logCastCall, logCastSend } from './castUtils';

export * from '../core/viemUtils';
export { setCastMode, isCastMode } from './castUtils';

// ── handleContractError (node version — colored output) ───────────────────────

export function handleContractError(error: any, abi: SuzakuABINames): never {
  throw logger.formatError(
    error?.cause ?? error instanceof Error ? [`${abi} ${error.cause ?? error}`] : [error],
    3,
  );
}

// ── withGnosisSafe ────────────────────────────────────────────────────────────
// Wraps contract.write to add Gnosis Safe routing (new / confirm / propose / skip).
// Must be applied AFTER core withSafeWrite so receipt waiting is already in place
// for the non-Safe path (delegated to the core-proxied write).
// Also overrides contract.safeWrite to simulate from the Safe's address.

export function withGnosisSafe<T extends SuzakuABINames>(
  contract: SafeSuzakuContract[T],
  abi: T,
  client: ExtendedWalletClient,
  confirmations = 1,
): SafeSuzakuContract[T] {
  if (!('write' in contract) || !('safe' in client)) return contract;

  const gnosisWriteHandler: ProxyHandler<Record<string, any>> = {
    get(target, prop) {
      const fn = (target as any)[prop];
      if (typeof fn !== 'function') return fn;
      return async (args: any, options: any) => {
        if (!client.safe) return fn(args, options); // delegate to core-proxied write

        const transaction = {
          to: contract.address,
          data: encodeFunctionData({ abi: SuzakuABI[abi] as Abi, functionName: prop as string, args }),
          chain: null,
          account: client.account,
          ...options,
          value: options?.value ?? '0',
        };

        const selection = await handleTransactionStrategy(
          transaction,
          client.safe,
          SuzakuABI[abi] as Abi,
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
            return undefined;
        }

        if (!hash) return undefined;

        const sig = `${contract.name}.${prop as string}(${args?.join ? args.join(', ') : args})`;
        logger.addData('txs', { to: contract.address, invocation: sig, hash, options });
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations });
        if (receipt.status === 'reverted') {
          throw logger.formatError([`Transaction ${color.red(sig)} (hash: ${hash}) reverted:\n` + JSON.stringify(receipt.logs, bigintReplacer)], 3);
        }
        const logs = parseEventLogs({ abi: SuzakuABI[abi], logs: receipt.logs });
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
          handleContractError(error, abi);
        }
      };
    },
  });

  return contract;
}

// ── withCastMode ──────────────────────────────────────────────────────────────
// Outermost wrapper: intercepts write and read in cast mode to log cast commands.

export function withCastMode<T extends SuzakuABINames>(
  contract: SafeSuzakuContract[T],
  abi: T,
  client: ExtendedClient,
): SafeSuzakuContract[T] {
  if ('write' in contract) {
    (contract as any).write = new Proxy((contract as any).write as Record<string, any>, {
      get(target, prop) {
        const fn = (target as any)[prop];
        if (typeof fn !== 'function') return fn;
        return async (args: any, options: any) => {
          if (isCastMode()) {
            const rpcUrl = client.chain?.rpcUrls?.default?.http?.[0];
            logCastSend(contract.name, contract.address, SuzakuABI[abi] as any, prop as string, Array.isArray(args) ? args : args != null ? [args] : [], rpcUrl, options);
            return undefined;
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
            logCastCall(contract.name, contract.address, SuzakuABI[abi] as any, prop as string, args, rpcUrl);
          }
          return fn(...args);
        };
      },
    });
  }

  return contract;
}

// ── curriedContract (node — composes core + Gnosis + cast mode) ───────────────

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

    const base = withMulticall(
      getContract({ abi: SuzakuABI[abi], address, client }) as SuzakuContract[T],
      abi,
      client,
    );
    const withSW = coreWithSafeWrite(base, abi, client, wait);
    const withGS = 'safe' in client
      ? withGnosisSafe(withSW, abi, client as unknown as ExtendedWalletClient, wait)
      : withSW;
    return withCastMode(withGS, abi, client) as any;
  };
