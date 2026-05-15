import {
  Abi,
  ExtractAbiFunctionNames,
} from 'abitype';
import { type Address, type ContractFunctionReturnType, type ContractFunctionName, type ContractFunctionArgs } from 'viem';

// --- Utilitaires de typage interne ---

type GetAbiArgs<TAbi extends Abi, TName extends string> =
  TName extends ContractFunctionName<TAbi>
  ? ContractFunctionArgs<TAbi, 'view' | 'pure' | 'nonpayable' | 'payable', TName>
  : never;

// Utilise ContractFunctionReturnType de viem pour que les addresses soient typées Address
// et non Hex (`0x${string}` brut).
// La contrainte externe reste `string` (pour que les mapped types avec génériques non résolus
// puissent l'appeler sans erreur) — la vérification est déléguée au conditional type interne.
type GetAbiReturn<TAbi extends Abi, TName extends string> =
  TName extends ContractFunctionName<TAbi, 'view' | 'pure'>
  ? ContractFunctionReturnType<TAbi, 'view' | 'pure', TName>
  : never;


// --- NOUVEAU : Type dédié pour les options d'écriture ---
// Tu peux remplacer `any` par les types de Viem si tu les importes 
// (ex: import { Account, Chain } from 'viem')
export type WriteOptions = {
  account?: `0x${string}` | any;
  chain?: any;
  value?: bigint;
  accessList?: any;
};

// --- Signatures dynamiques ---

type ReadSignature<TArgs, TReturn> = TArgs extends readonly []
  ? (args?: readonly []) => Promise<TReturn>
  : (args: TArgs) => Promise<TReturn>;

type WriteSignature<TArgs> = TArgs extends readonly []
  ? (args?: readonly [], options?: WriteOptions) => Promise<`0x${string}`>
  : (args: TArgs, options?: WriteOptions) => Promise<`0x${string}`>;


// --- Système de Multicall (aligné sur MulticallFn de viemUtils.ts) ---

// Noms des fonctions read restreints à TSelectedMethods
type ReadMethodNames<TAbi extends Abi, TSelectedMethods extends string> =
  TSelectedMethods & ExtractAbiFunctionNames<TAbi, 'view' | 'pure'>;

// Un item multicall : string (si pas d'args) ou { name, args? } — même pattern que MulticallItem dans viemUtils.ts
type HasArgs<TAbi extends Abi, FName extends ExtractAbiFunctionNames<TAbi, 'view' | 'pure'>> =
  GetAbiArgs<TAbi, FName> extends readonly [] ? false : true;

type MulticallItem<TAbi extends Abi, TSelectedMethods extends string, FName extends ReadMethodNames<TAbi, TSelectedMethods> = ReadMethodNames<TAbi, TSelectedMethods>> =
  FName extends ReadMethodNames<TAbi, TSelectedMethods>
  ? HasArgs<TAbi, FName> extends true
  ? { name: FName; args: GetAbiArgs<TAbi, FName> }
  : FName | { name: FName }
  : never;

// Extraction du nom depuis un item (string ou { name })
type ExtractName<TAbi extends Abi, TSelectedMethods extends string, Item> =
  Item extends string ? Item :
  Item extends { name: infer N } ? N extends ReadMethodNames<TAbi, TSelectedMethods> ? N : never :
  never;

// Résultat d'un item multicall individuel
// `infer N extends ContractFunctionName<...>` (TS 4.8+) : lie ET rétrécit N en une seule
// opération, ce qui satisfait la contrainte de GetAbiReturn sans cast manuel.
type MulticallItemResult<TAbi extends Abi, TSelectedMethods extends string, Item> =
  ExtractName<TAbi, TSelectedMethods, Item> extends infer N extends ContractFunctionName<TAbi, 'view' | 'pure'>
  ? GetAbiReturn<TAbi, N>
  : never;

// Résultat simple (tableau des valeurs de retour)
type MulticallResultsSimple<TAbi extends Abi, TSelectedMethods extends string, Items extends readonly MulticallItem<TAbi, TSelectedMethods>[]> = {
  [K in keyof Items]: MulticallItemResult<TAbi, TSelectedMethods, Items[K]>;
};

// Résultat détaillé (avec name + result)
type MulticallResultsDetailed<TAbi extends Abi, TSelectedMethods extends string, Items extends readonly MulticallItem<TAbi, TSelectedMethods>[]> = {
  [K in keyof Items]: { name: ExtractName<TAbi, TSelectedMethods, Items[K]>; result: MulticallItemResult<TAbi, TSelectedMethods, Items[K]> };
};

export interface MulticallOptions<D extends boolean = false, S extends boolean = true> {
  strict?: S;
  details?: D;
}

// Type de la fonction multicall — restreint à TSelectedMethods (par défaut toutes les fonctions)
export type MulticallFn<TAbi extends Abi, TSelectedMethods extends string = ExtractAbiFunctionNames<TAbi>> = {
  <const Items extends readonly MulticallItem<TAbi, TSelectedMethods>[], D extends boolean = false, S extends boolean = true>(
    items: Items,
    options?: MulticallOptions<D, S>
  ): Promise<D extends true ? MulticallResultsDetailed<TAbi, TSelectedMethods, Items> : MulticallResultsSimple<TAbi, TSelectedMethods, Items>>;
};


// Mapped type for safeWrite — exported so viemUtils.ts can use it as SafeEnhancedContract.safeWrite
// (avoids the `Record<string, F>` mismatch that TypeScript can't verify against named properties)
export type SafeWriteFn<
  TAbi extends Abi,
  TSelectedMethods extends ExtractAbiFunctionNames<TAbi> = ExtractAbiFunctionNames<TAbi>
> = {
  [K in TSelectedMethods & ExtractAbiFunctionNames<TAbi, 'nonpayable' | 'payable'>]:
  WriteSignature<GetAbiArgs<TAbi, K>>;
};

// --- Interfaces Globales ---

export interface IReadContract<
  TAbi extends Abi,
  TSelectedMethods extends ExtractAbiFunctionNames<TAbi> = ExtractAbiFunctionNames<TAbi>
> {
  address: Address;

  read: {
    [K in TSelectedMethods & ExtractAbiFunctionNames<TAbi, 'view' | 'pure'>]:
    ReadSignature<GetAbiArgs<TAbi, K>, GetAbiReturn<TAbi, K>>;
  };

  multicall: MulticallFn<TAbi, TSelectedMethods>;
}

export interface IContract<
  TAbi extends Abi,
  TSelectedMethods extends ExtractAbiFunctionNames<TAbi> = ExtractAbiFunctionNames<TAbi>
> extends IReadContract<TAbi, TSelectedMethods> {
  safeWrite: SafeWriteFn<TAbi, TSelectedMethods>;
}
