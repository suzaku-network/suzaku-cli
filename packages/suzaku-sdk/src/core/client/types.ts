import type { Hex, Abi, ContractFunctionName, ContractFunctionArgs, ContractFunctionReturnType, AccessList, Account, Chain, Address } from 'viem';
import type {
  AvalancheWalletClient,
  AvalancheClient,
  PChainActions,
  CChainActions,
} from '@avalanche-sdk/client';
import type { chainList } from './chainList';

export type Network = 'fuji' | 'mainnet' | 'anvil';
export type Chains = keyof typeof chainList;
export type PChainAddress = `P-${string}`;
export type Addresses = { P: PChainAddress; C: Hex };

type ClientExtension = {
  network: Network;
  pChain: PChainActions;
  cChain: CChainActions;
  wait?: number;
  skipAbiValidation?: boolean;
};

export type ExtendedWalletClient = AvalancheWalletClient & ClientExtension & {
  addresses: Addresses;
};

export type ExtendedPublicClient = AvalancheClient & ClientExtension;

export type ExtendedClient = ExtendedWalletClient | ExtendedPublicClient;

// Isomorphic contract service types — compatible with viem EnhancedContract and wagmi wrappers.

export type WriteOptions = {
  accessList?: AccessList;
  account?: Account | Address;
  chain?: Chain | null;
};

export type ContractReadFn<TResult> = () => Promise<TResult>;
export type ContractReadFnArgs<TArgs extends readonly unknown[], TResult> = (args: TArgs) => Promise<TResult>;
export type ContractWriteFn<TArgs extends readonly unknown[]> = (args: TArgs, options?: WriteOptions) => Promise<Hex>;
export type ContractBatchReadFn<TArgs extends readonly unknown[], TResult> = (argsBatch: readonly TArgs[]) => Promise<readonly TResult[]>;

type AsArray<T> = Extract<T, readonly unknown[]>;

type ReadFn<TAbi extends Abi, K extends ContractFunctionName<TAbi, 'view' | 'pure'>> =
  ContractFunctionArgs<TAbi, 'view' | 'pure', K> extends readonly []
    ? ContractReadFn<ContractFunctionReturnType<TAbi, 'view' | 'pure', K>>
    : ContractReadFnArgs<AsArray<ContractFunctionArgs<TAbi, 'view' | 'pure', K>>, ContractFunctionReturnType<TAbi, 'view' | 'pure', K>>;

type WriteFn<TAbi extends Abi, K extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>> =
  ContractFunctionArgs<TAbi, 'nonpayable' | 'payable', K> extends readonly []
    ? () => Promise<Hex>
    : ContractWriteFn<AsArray<ContractFunctionArgs<TAbi, 'nonpayable' | 'payable', K>>>;

type BatchReadFn<TAbi extends Abi, K extends ContractFunctionName<TAbi, 'view' | 'pure'>> =
  ContractBatchReadFn<
    AsArray<ContractFunctionArgs<TAbi, 'view' | 'pure', K>>,
    ContractFunctionReturnType<TAbi, 'view' | 'pure', K>
  >;

export type ContractReader<
  TAbi extends Abi,
  TFunctions extends ContractFunctionName<TAbi, 'view' | 'pure'>
> = { [K in TFunctions]: ReadFn<TAbi, K> };

export type ContractWriter<
  TAbi extends Abi,
  TFunctions extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>
> = { [K in TFunctions]: WriteFn<TAbi, K> };

export type ContractBatchReader<
  TAbi extends Abi,
  TFunctions extends ContractFunctionName<TAbi, 'view' | 'pure'>
> = { [K in TFunctions as `${string & K}Batch`]: BatchReadFn<TAbi, K> };

