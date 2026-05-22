import { pvm, networkIDs, utils } from '@avalabs/avalanchejs';
import { hexToBytes, type Hex } from 'viem';
import { avalanche, avalancheFuji } from 'viem/chains';
import { pipe, R, type Result } from '@mobily/ts-belt';
import { type NodeId, cb58ToHex } from './avalancheUtils';
import { type ExtendedClient, type ExtendedWalletClient } from '../client/types';
import { isCastMode, CAST_DUMMY_HASH } from './castUtils';
import { logger } from '../logger/index';
import { packL1ConversionMessage, type PackL1ConversionMessageArgs } from './warpUtils';

// ── Types & interfaces ────────────────────────────────────────────────────────

export function add0x(hex: string): `0x${string}` {
    return /^0x/i.test(hex) ? hex as `0x${string}` : `0x${hex}`;
}

export type GetValidatorAtObject = { [nodeId: string]: { publicKey: string; weight: bigint } };

export interface PChainBaseParams {
    client: ExtendedWalletClient;
}

export interface CreateChainParams extends PChainBaseParams {
    chainName: string;
    subnetId: string;
    genesisData: string;
    SubnetEVMId?: string;
}

export interface ConvertToL1Params extends PChainBaseParams {
    subnetId: string;
    chainId: string;
    managerAddress: Hex;
    validators: {
        nodeID: string;
        blsPublicKey: string;
        blsProofOfPossession: string;
        weight: number;
        balance: number;
    }[];
}

export interface RegisterL1ValidatorParams extends PChainBaseParams {
    blsProofOfPossession: string;
    signedMessage: string;
    initialBalance: bigint;
}

export interface RemoveL1ValidatorParams extends PChainBaseParams {
    validationID: string;
}

export interface SetValidatorWeightParams extends PChainBaseParams {
    validationID: string;
    message: string;
}

export type ExtractWarpMessageFromTxParams = {
    txId: string;
};

interface AddressObject {
    threshold: number;
    addresses: string[];
}

interface ValidatorSigner {
    publicKey: string;
    proofOfPossession: string;
}

interface Validator {
    nodeID: string;
    weight: number;
    balance: number;
    signer: ValidatorSigner;
    remainingBalanceOwner: AddressObject;
    deactivationOwner: AddressObject;
}

export type ExtractWarpMessageFromTxResponse = {
    message: Hex;
    justification: Hex;
    subnetId: string;
    signingSubnetId: string;
    networkId: typeof networkIDs.FujiID | typeof networkIDs.MainnetID;
    validators: Validator[];
    chainId: string;
    managerAddress: Hex;
};

export type ValidatorsResponsePatched = (pvm.GetCurrentValidatorsResponse['validators'][number] & { balance?: number; validationID?: string })[];

export default interface NodeConfig {
    nodeID: NodeId;
    blsPublicKey: Hex;
    blsProofOfPossession: Hex;
    weight: number;
    balance: number;
}

// ── Internal types for P-Chain RPC response parsing ──────────────────────────

interface UnsignedConvertTx {
    networkID: number;
    blockchainID: string;
    subnetID: string;
    chainID: string;
    address: string;
    validators: Validator[];
    [key: string]: unknown;
}

interface TransactionResult {
    tx: {
        unsignedTx: UnsignedConvertTx;
        credentials: { signatures: string[] }[];
        id: string;
    };
    encoding: string;
}

type InitializeValidatorSetArgs = [
    {
        subnetID: `0x${string}`;
        validatorManagerBlockchainID: `0x${string}`;
        validatorManagerAddress: `0x${string}`;
        initialValidators: readonly { nodeID: `0x${string}`; blsPublicKey: `0x${string}`; weight: bigint }[];
    },
    number,
];

// ── P-Chain functions ─────────────────────────────────────────────────────────

export async function issuePchainTx(client: ExtendedWalletClient, tx: any, testnet: boolean = true): Promise<Result<Hex, string>> {
    if (isCastMode()) {
        const rpcUrl = testnet ? avalancheFuji.rpcUrls.default.http[0] : avalanche.rpcUrls.default.http[0];
        const endpoint = rpcUrl.replace('C/rpc', 'P');
        const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'platform.issueTx', params: { tx: tx.signedTxHex, encoding: 'hex' } });
        logger.log(`\ncurl -X POST -H "Content-Type: application/json" -d '${body}' ${endpoint}\n`);
        return R.Ok(CAST_DUMMY_HASH);
    }
    const result = pipe(
        await R.fromPromise(client.sendXPTransaction(tx)),
        R.map(res => res),
        R.mapError(err => '\nError issuing P-Chain Signed Tx:\n' + (err as Error).message),
    );
    if (R.isOk(result)) {
        await client.waitForTxn({ ...result._0, maxRetries: 10 });
        return R.Ok(result._0.txHash as Hex);
    }
    return result;
}

export async function createSubnet(params: PChainBaseParams): Promise<Hex> {
    const { P: pAddress } = params.client.addresses;
    const tx = await params.client.pChain.prepareCreateSubnetTxn({
        subnetOwners: { addresses: [pAddress], threshold: 1 },
        fromAddresses: [pAddress],
    });
    return R.getExn(await issuePchainTx(params.client, tx));
}

export async function createChain(params: CreateChainParams): Promise<Hex> {
    const { P: pAddress } = params.client.addresses;
    const vmId = params.SubnetEVMId || 'dkr3SJRCf2QfRUaepreGf2PtfEtpLHuPixeBMNrf1QQBxWLNN';
    logger.log(`Using default EVM VM ID: ${vmId}`);
    const tx = await params.client.pChain.prepareCreateChainTxn({
        subnetId: params.subnetId,
        vmId,
        chainName: params.chainName,
        genesisData: JSON.parse(params.genesisData),
        subnetAuth: [0],
        fromAddresses: [pAddress],
    });
    const txID = R.getExn(await issuePchainTx(params.client, tx));
    logger.log('Created chain: ', txID);
    return txID;
}

export async function convertToL1(params: ConvertToL1Params): Promise<Hex> {
    const { P: pAddress } = params.client.addresses;
    const owner = { addresses: [pAddress], threshold: 1 };
    const tx = await params.client.pChain.prepareConvertSubnetToL1Txn({
        subnetId: params.subnetId,
        blockchainId: params.chainId,
        managerContractAddress: params.managerAddress,
        validators: params.validators.map(v => ({
            nodeId: v.nodeID,
            nodePoP: { publicKey: v.blsPublicKey, proofOfPossession: v.blsProofOfPossession },
            weight: BigInt(v.weight),
            initialBalanceInAvax: BigInt(v.balance),
            remainingBalanceOwner: owner,
            deactivationOwner: owner,
        })),
        subnetAuth: [0],
        fromAddresses: [pAddress],
    });
    return R.getExn(await issuePchainTx(params.client, tx));
}

export async function registerL1Validator(params: RegisterL1ValidatorParams): Promise<Result<Hex, string>> {
    const { P: pAddress } = params.client.addresses;
    const tx = await params.client.pChain.prepareRegisterL1ValidatorTxn({
        initialBalanceInAvax: params.initialBalance,
        blsSignature: params.blsProofOfPossession,
        message: params.signedMessage,
        fromAddresses: [pAddress],
    });
    return issuePchainTx(params.client, tx);
}

export async function removeL1Validator(params: RemoveL1ValidatorParams): Promise<Result<string, string>> {
    const { P: pAddress } = params.client.addresses;
    const tx = await params.client.pChain.prepareDisableL1ValidatorTxn({
        validationId: params.validationID,
        disableAuth: [0],
        fromAddresses: [pAddress],
    });
    return issuePchainTx(params.client, tx);
}

export async function getCurrentValidators(client: ExtendedClient, subnetId: string): Promise<ValidatorsResponsePatched> {
    const response = await client.pChain.getCurrentValidators({ subnetID: subnetId });
    return response.validators as ValidatorsResponsePatched;
}

export async function getValidatorsAt(client: ExtendedClient, subnetId: string): Promise<GetValidatorAtObject> {
    const { height } = await client.pChain.getHeight();
    const response = await client.pChain.getValidatorsAt({ subnetID: subnetId, height });
    if (!response.validators) return {};
    return response.validators as unknown as GetValidatorAtObject;
}

export async function validates(client: ExtendedClient, subnetId: string): Promise<string | undefined> {
    const response = await client.pChain.validates({ subnetID: subnetId });
    if (!response.blockchainIDs || response.blockchainIDs.length === 0) return undefined;
    return response.blockchainIDs[0];
}

export async function validatedBy(client: ExtendedClient, blockchainId: string): Promise<string | undefined> {
    client.pChain
    const response = await client.pChain.validatedBy({ blockchainID: blockchainId });
    if (!response.subnetID) return undefined;
    return response.subnetID;
}

export async function setValidatorWeight(params: SetValidatorWeightParams): Promise<Result<string, string>> {
    const { P: pAddress } = params.client.addresses;
    const tx = await params.client.pChain.prepareSetL1ValidatorWeightTxn({
        message: params.message,
        fromAddresses: [pAddress],
    });
    return issuePchainTx(params.client, tx);
}

export async function extractWarpMessageFromPChainTx(subnetId: string, txId: string, client: ExtendedClient): Promise<ExtractWarpMessageFromTxResponse> {
    const networkId = client.network === 'fuji' ? networkIDs.FujiID : networkIDs.MainnetID;
    const data = await client.pChain.getTx({ txID: txId, encoding: 'json' }) as unknown as TransactionResult;

    if (!data?.tx?.unsignedTx?.subnetID || !data?.tx?.unsignedTx?.chainID || !data?.tx?.unsignedTx?.address || !data?.tx?.unsignedTx?.validators) {
        logger.log('txId', txId);
        logger.log('data', data);
        throw new Error('Invalid transaction data, are you sure this is a conversion transaction?');
    }

    const conversionArgs: PackL1ConversionMessageArgs = {
        subnetId: data.tx.unsignedTx.subnetID,
        managerChainID: data.tx.unsignedTx.chainID,
        managerAddress: data.tx.unsignedTx.address as Hex,
        validators: data.tx.unsignedTx.validators.map((v) => ({
            nodeID: v.nodeID,
            nodePOP: v.signer,
            weight: v.weight,
        })),
    };

    const [message, justification] = packL1ConversionMessage(conversionArgs, networkId, data.tx.unsignedTx.blockchainID as string);
    return {
        message: utils.bufferToHex(message) as Hex,
        justification: utils.bufferToHex(justification) as Hex,
        subnetId: data.tx.unsignedTx.subnetID,
        signingSubnetId: subnetId,
        networkId,
        validators: data.tx.unsignedTx.validators,
        chainId: data.tx.unsignedTx.chainID,
        managerAddress: data.tx.unsignedTx.address as Hex,
    };
}

export async function getValidatorManagerInitializationArgsFromWarpTx(conversionTxID: string, subnetId: string, client: ExtendedClient): Promise<InitializeValidatorSetArgs> {
    const { validators, chainId, managerAddress } = await extractWarpMessageFromPChainTx(subnetId, conversionTxID, client);
    return [
        {
            subnetID: cb58ToHex(subnetId),
            validatorManagerBlockchainID: cb58ToHex(chainId),
            validatorManagerAddress: managerAddress,
            initialValidators: validators.map(({ nodeID, weight, signer }) => ({
                nodeID: add0x(nodeID),
                blsPublicKey: add0x(signer.publicKey),
                weight: BigInt(weight),
            })),
        },
        0,
    ];
}

export async function getSigningSubnetIdFromWarpMessage(client: ExtendedClient, message: string): Promise<string> {
    const signingChainIdHex = ('0x' + message.slice(14, 78)) as Hex;
    const signingChainId = utils.base58check.encode(hexToBytes(signingChainIdHex));
    const signingSubnetId = await validatedBy(client, signingChainId);
    if (!signingSubnetId) throw new Error('Could not find signing subnet ID');
    return signingSubnetId;
}
