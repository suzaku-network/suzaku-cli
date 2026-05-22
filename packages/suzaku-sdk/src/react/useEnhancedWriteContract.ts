import { useWriteContract } from 'wagmi';
import { type Abi } from 'viem';
import { useCallback } from 'react';
import { decodeRevertError } from '../core/client/viemUtils';

// Drop-in replacement for wagmi's useWriteContract that decodes custom errors
// from injected wallets (e.g. Core) which embed revert data in ethers-format strings.
// The contract name is read from abi.contractName (embedded by the update-abis script)
// and used in the error format: "<contractName> reverted: <errorName(args)>"
export function useEnhancedWriteContract() {
  const wagmi = useWriteContract();

  const writeContractAsync = useCallback(
    async (params: any, options?: any) => {
      try {
        return await wagmi.writeContractAsync(params, options);
      } catch (error: any) {
        const contractName: string = (params.abi as any)?.contractName ?? String(params.address);
        const decoded = decodeRevertError(error, (params.abi ?? []) as Abi);
        if (decoded) throw new Error(`${contractName} reverted: ${decoded}`);
        throw error;
      }
    },
    [wagmi.writeContractAsync],
  ) as typeof wagmi.writeContractAsync;

  return { ...wagmi, writeContractAsync };
}
