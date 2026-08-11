import { formatUnits, Hex } from 'viem';
import { encodeNodeID } from './utils';

export interface PChainValidatorBalance {
  nodeID: string;
  balance?: number | string | bigint;
}

export function operatorStakeArgs(
  account: Hex,
  epoch: number,
  primaryAssetClass: bigint,
): readonly [Hex, number, bigint] {
  return [account, epoch, primaryAssetClass];
}

export function findPChainValidator<T extends PChainValidatorBalance>(
  validatorNodeID: Hex,
  validators: T[],
): T | undefined {
  const nodeID = encodeNodeID(validatorNodeID);
  return validators.find((validator) => validator.nodeID === nodeID);
}

export function formatPChainBalanceFields(balance: number | string | bigint | undefined) {
  if (balance === undefined) {
    return {
      balanceKnown: false,
      balanceNAvax: null,
      balanceAVAX: null,
    };
  }

  const balanceNAvax = String(balance);
  return {
    balanceKnown: true,
    balanceNAvax,
    balanceAVAX: formatUnits(BigInt(balanceNAvax), 9),
  };
}

export function formatPChainBalance(balance: number | string | bigint | undefined) {
  const fields = formatPChainBalanceFields(balance);
  return {
    ...fields,
    // Compatibility field: this value has always represented the raw nAVAX
    // balance despite its historical name.
    continuousAVAXBalance: fields.balanceNAvax,
  };
}
