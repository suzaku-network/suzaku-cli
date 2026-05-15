import type { Hex } from 'viem';
import type { IContract } from '../client/contract';
import type { ExtendedWalletClient } from '../client/types';
import type { TPoASecurityModuleABI } from './abi';
import { getBalancerValidatorManager } from '../BalancerValidatorManager';
import { parseNodeID, type NodeId } from '../lib/avalancheUtils';

export async function initiateValidatorRemoval(
  client: ExtendedWalletClient,
  poaSecurityModule: IContract<TPoASecurityModuleABI, 'balancerValidatorManager' | 'initiateValidatorRemoval'>,
  nodeId: NodeId,
): Promise<Hex> {
  const balancerAddress = await poaSecurityModule.read.balancerValidatorManager();
  const balancer = await getBalancerValidatorManager(client, balancerAddress);
  const nodeIdHex = parseNodeID(nodeId, false);
  const validationId = await balancer.read.getNodeValidationID([nodeIdHex]);
  return poaSecurityModule.safeWrite.initiateValidatorRemoval([validationId]);
}
