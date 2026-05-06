import { hexToBytes, type Hex } from 'viem';
import { type ExtendedWalletClient } from './client/types';
import { requirePChainBallance } from './transferUtils';
import { collectSignaturesInitializeValidatorSet, packWarpIntoAccessList } from '../core/lib/warpUtils';
import { nodeLogger as logger } from './nodeLogger';
import { getValidatorManager } from '../core/ValidatorManager/abi';
import { type Result } from '@mobily/ts-belt';
import type NodeConfig from '../core/lib/pChainUtils';
import {
    convertToL1,
    validatedBy,
    getValidatorManagerInitializationArgsFromWarpTx,
    issuePchainTx,
} from '../core/lib/pChainUtils';

export * from '../core/lib/pChainUtils';

export async function increasePChainValidatorBalance(
    client: ExtendedWalletClient,
    amount: number,
    validationId: string,
    check: boolean = true,
): Promise<Result<Hex, string>> {
    const { P: pAddress } = client.addresses;
    const nAVAX = BigInt(Math.floor(amount * 1e9));
    if (check) await requirePChainBallance(client, nAVAX);
    const tx = await client.pChain.prepareIncreaseL1ValidatorBalanceTxn({
        balanceInAvax: nAVAX,
        validationId,
        fromAddresses: [pAddress],
    });
    const signedTx = await client.signXPTransaction(tx);
    return issuePchainTx(client, signedTx);
}

export async function convertSubnetToL1(params: {
    subnetId: string;
    chainId: string;
    validatorManager: Hex;
    client: ExtendedWalletClient;
    validators: NodeConfig[];
    validatorManagerBlockchainID: string;
    convertTx?: string;
    init?: boolean;
    churnPeriodSeconds?: bigint;
    maximumChurnPercentage?: number;
}) {
    const managerAddress = params.validatorManager;
    const { client, validators } = params;

    const convertTxId = params.convertTx || await convertToL1({
        client,
        subnetId: params.subnetId,
        chainId: params.validatorManagerBlockchainID,
        managerAddress,
        validators,
    });
    logger.log('convertTx', convertTxId);

    const signingSubnetId = await validatedBy(client, params.validatorManagerBlockchainID);
    if (!signingSubnetId) throw new Error('Could not get signing subnet ID');
    logger.log('signingSubnetId', signingSubnetId);

    const signed = await collectSignaturesInitializeValidatorSet({
        network: client.network,
        subnetId: params.subnetId,
        validatorManagerBlockchainID: params.validatorManagerBlockchainID,
        validatorManagerSubnetID: signingSubnetId,
        managerAddress,
        validators,
    });

    const signedBytes = hexToBytes(`0x${signed}`);
    const accessList = packWarpIntoAccessList(signedBytes);

    const args = await getValidatorManagerInitializationArgsFromWarpTx(convertTxId, params.subnetId, client);

    const validatorManager = await getValidatorManager(client, params.validatorManager);
    const init = {
        admin: client.addresses.C,
        subnetID: args[0].subnetID,
        churnPeriodSeconds: params.churnPeriodSeconds || 10n,
        maximumChurnPercentage: params.maximumChurnPercentage || 20,
    };
    if (params.init) await validatorManager.safeWrite.initialize([init]) && logger.log('ValidatorManager initialized');
    await validatorManager.safeWrite.initializeValidatorSet(args, {
        account: client.account!,
        chain: null,
        accessList,
    });
    logger.log('ValidatorSet initialized');

    return { txHash: convertTxId };
}
