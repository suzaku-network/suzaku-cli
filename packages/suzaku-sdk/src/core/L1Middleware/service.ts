import type { Address } from 'viem';
import type { IContract } from '../client/contract';
import {TL1MiddlewareABI} from "./abi"

export async function getCurrentEpoch(middleware: IContract<TL1MiddlewareABI, "getCurrentEpoch">) {
  return middleware.read.getCurrentEpoch();
}

export async function registerOperator(middleware: IContract<TL1MiddlewareABI, "registerOperator">, operator: Address) {
  return middleware.safeWrite.registerOperator([operator]);
}
