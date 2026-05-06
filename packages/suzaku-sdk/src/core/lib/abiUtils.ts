import type { Abi } from 'viem';

type ErrorItem = Extract<Abi[number], { type: 'error' }>;
type ExtractErrors<T extends Abi> = Extract<T[number], { type: 'error' }>;

export function withErrors<T extends Abi, O extends Abi[]>(base: T, ...others: [...O]): [...T, ...ExtractErrors<O[number]>[]] {
  const errors = others.flatMap(abi => abi.filter((item): item is ErrorItem => item.type === 'error'));
  return [...base, ...errors] as [...T, ...ExtractErrors<O[number]>[]];
}
