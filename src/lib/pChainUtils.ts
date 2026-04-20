import { utils, pvm, UnsignedTx, networkIDs } from "@avalabs/avalanchejs";
import { cb58ToHex, NodeId } from "./utils";
import { ExtendedClient, ExtendedWalletClient } from "../client";
import { requirePChainBallance } from "./transferUtils";
import { Hex, bytesToHex, hexToBytes } from "viem";
import { collectSignaturesInitializeValidatorSet, packL1ConversionMessage, PackL1ConversionMessageArgs, packWarpIntoAccessList } from "./warpUtils";
import { isCastMode, logPChainIssueTx } from "./castUtils";
import { color } from "console-log-colors";
import { pipe, R, Result } from "@mobily/ts-belt";
import { logger } from './logger';
import { sha256 } from '@noble/hashes/sha2';
import { avalanche, avalancheFuji } from "viem/chains";
import { getConfig } from "../config";

export type GetValidatorAtObject = { [nodeId: string]: { publicKey: string, weight: bigint } };

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
}

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
}

interface OutputObject {
    addresses: string[];
    amount: number;
    locktime: number;
    threshold: number;
}

interface Output {
    collateralID: string;
    fxID: string;
    output: OutputObject;
}

interface InputObject {
    amount: number;
    signatureIndices: number[];
}

interface Input {
    txID: string;
    outputIndex: number;
    collateralID: string;
    fxID: string;
    input: InputObject;
}

interface SubnetAuthorization {
    signatureIndices: number[];
}

interface UnsignedConvertTx {
    networkID: number;
    blockchainID: string;
    outputs: Output[];
    inputs: Input[];
    memo: string;
    subnetID: string;
    chainID: string;
    address: string;
    validators: Validator[];
    subnetAuthorization: SubnetAuthorization;
}

interface Credential {
    signatures: string[];
}

interface Transaction {
    unsignedTx: UnsignedConvertTx;
    credentials: Credential[];
    id: string;
}

interface TransactionResult {
    tx: Transaction;
    encoding: string;
}


type InitializeValidatorSetArgs = [{ subnetID: `0x${string}`; validatorManagerBlockchainID: `0x${string}`; validatorManagerAddress: `0x${string}`; initialValidators: readonly { nodeID: `0x${string}`; blsPublicKey: `0x${string}`; weight: bigint; }[]; }, number]

export function add0x(hex: string) {
    return /^0x/i.test(hex) ? hex : `0x${hex}`;
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
    const vmId = params.SubnetEVMId || "dkr3SJRCf2QfRUaepreGf2PtfEtpLHuPixeBMNrf1QQBxWLNN";
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

export type ValidatorsResponsePatched = (pvm.GetCurrentValidatorsResponse['validators'][number] & { balance?: number, validationID?: string })[];

export async function getCurrentValidators(client: ExtendedClient, subnetId: string): Promise<ValidatorsResponsePatched> {
    const response = await client.pChain.getCurrentValidators({ subnetID: subnetId });
    return response.validators as ValidatorsResponsePatched;
}

export async function getValidatorsAt(client: ExtendedClient, subnetId: string): Promise<GetValidatorAtObject> {
    const { height } = await client.pChain.getHeight();
    const response = await client.pChain.getValidatorsAt({ subnetID: subnetId, height });
    if (!response.validators) {
        return {};
    }
    return response.validators as unknown as GetValidatorAtObject;
}

export async function validates(client: ExtendedClient, subnetId: string): Promise<string | undefined> {
    const response = await client.pChain.validates({ subnetID: subnetId });
    if (!response.blockchainIDs || response.blockchainIDs.length === 0) {
        return undefined;
    }
    return response.blockchainIDs[0];
}

export async function validatedBy(client: ExtendedClient, blockchainId: string): Promise<string | undefined> {
    const response = await client.pChain.validatedBy({ blockchainID: blockchainId });
    if (!response.subnetID) {
        return undefined;
    }
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

export async function increasePChainValidatorBalance(
    client: ExtendedWalletClient,
    amount: number,
    validationId: string,
    check: boolean = true
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

export async function extractWarpMessageFromPChainTx(subnetId: string, txId: string, client: ExtendedClient): Promise<ExtractWarpMessageFromTxResponse> {
    const networkId = client.network === 'fuji' ? networkIDs.FujiID : networkIDs.MainnetID;
    const data = await client.pChain.getTx({ txID: txId, encoding: 'json' }) as unknown as TransactionResult;

    if (!data?.tx?.unsignedTx?.subnetID || !data?.tx?.unsignedTx?.chainID || !data?.tx?.unsignedTx?.address || !data?.tx?.unsignedTx?.validators) {
        logger.log('txId', txId)
        logger.log('data', data)
        throw new Error("Invalid transaction data, are you sure this is a conversion transaction?");
    }

    const conversionArgs: PackL1ConversionMessageArgs = {
        subnetId: data.tx.unsignedTx.subnetID,
        managerChainID: data.tx.unsignedTx.chainID,
        managerAddress: data.tx.unsignedTx.address as Hex,
        validators: data.tx.unsignedTx.validators.map((validator) => ({
            nodeID: validator.nodeID,
            nodePOP: validator.signer,
            weight: validator.weight
        }))
    };

    const [message, justification] = packL1ConversionMessage(conversionArgs, networkId, data.tx.unsignedTx.blockchainID);
    return {
        message: utils.bufferToHex(message) as Hex,
        justification: utils.bufferToHex(justification) as Hex,
        subnetId: data.tx.unsignedTx.subnetID,
        signingSubnetId: subnetId,
        networkId,
        validators: data.tx.unsignedTx.validators,
        chainId: data.tx.unsignedTx.chainID,
        managerAddress: data.tx.unsignedTx.address as Hex,
    }
}

export default interface NodeConfig {
    nodeID: NodeId,
    blsPublicKey: Hex,
    blsProofOfPossession: Hex,
    weight: number,
    balance: number
}

export async function convertSubnetToL1(params:
    {
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
    // 1) convert to L1
    const convertTx = params.convertTx || await convertToL1({
        client,
        subnetId: params.subnetId,
        chainId: params.validatorManagerBlockchainID,
        managerAddress,
        validators,
    });
    logger.log('convertTx', convertTx)
    // 2) collect signatures

    const signingSubnetId = await validatedBy(client, params.validatorManagerBlockchainID);
    if (!signingSubnetId) {
        throw new Error("Could not get signing subnet ID");
    }
    logger.log('signingSubnetId', signingSubnetId)
    const signed = await collectSignaturesInitializeValidatorSet({
        network: client.network,
        subnetId: params.subnetId,
        validatorManagerBlockchainID: params.validatorManagerBlockchainID,
        validatorManagerSubnetID: signingSubnetId,
        managerAddress,
        validators,
    });

    // 3) pack warp → accessList
    const signedBytes = hexToBytes(`0x${signed}`);
    const accessList = packWarpIntoAccessList(signedBytes);

    // 4) call initializeValidatorSet
    // client.chain = chain;
    const args = await getValidatorManagerInitializationArgsFromWarpTx(convertTx, params.subnetId, client);

    const config = await getConfig(client, 1, true)
    const validatorManager = await config.contracts.ValidatorManager(params.validatorManager)
    const init = {
        admin: client.addresses.C,
        subnetID: args[0].subnetID,
        churnPeriodSeconds: params.churnPeriodSeconds || 10n,
        maximumChurnPercentage: params.maximumChurnPercentage || 20,
    }
    if (params.init) await validatorManager.safeWrite.initialize([init]) && logger.log('ValidatorManager initialized')
    await validatorManager.safeWrite.initializeValidatorSet(args, {
        account: client.account!,
        chain: null,
        accessList
    });
    logger.log('ValidatorSet initialized')

    return { txHash: convertTx };

}

export async function getValidatorManagerInitializationArgsFromWarpTx(conversionTxID: string, subnetId: string, client: ExtendedClient): Promise<InitializeValidatorSetArgs> {
    const { validators, chainId, managerAddress } = await extractWarpMessageFromPChainTx(subnetId, conversionTxID, client);
    // Prepare transaction arguments
    return [
        {
            subnetID: cb58ToHex(subnetId),
            validatorManagerBlockchainID: cb58ToHex(chainId),
            validatorManagerAddress: managerAddress,
            initialValidators: validators
                .map(({ nodeID, weight, signer }: { nodeID: string, weight: number, signer: { publicKey: string } }) => {
                    // Ensure nodeID and blsPublicKey are properly formatted
                    // If nodeID is in BinTools format, convert to hex
                    const nodeIDBytes = nodeID.startsWith('0x')
                        ? nodeID
                        : add0x(nodeID);

                    // If blsPublicKey is in BinTools format, convert to hex
                    const blsPublicKeyBytes = signer.publicKey.startsWith('0x')
                        ? signer.publicKey
                        : add0x(signer.publicKey);

                    return {
                        nodeID: nodeIDBytes as Hex,
                        blsPublicKey: blsPublicKeyBytes as Hex,
                        weight: BigInt(weight)
                    };
                })
        },
        0 // messageIndex parameter
    ];
}

export async function issuePchainTx(client: ExtendedWalletClient, tx: any, testnet: boolean = true): Promise<Result<Hex, string>> {
    if (isCastMode()) {
        const rpcUrl = testnet ? avalancheFuji.rpcUrls.default.http[0] : avalanche.rpcUrls.default.http[0];
        return R.Ok(logPChainIssueTx(tx.signedTxHex, rpcUrl));
    }
    const result = pipe(await R.fromPromise(client.sendXPTransaction(tx)),
        R.map(res => res),
        R.mapError(err => "\n" + color.red(`Error issuing P-Chain Signed Tx:`) + `\n${(err as Error).message}`)
    )
    if (R.isOk(result)) {
        await client.waitForTxn({ ...result._0, maxRetries: 10 });
        return R.Ok(result._0.txHash as Hex);
    }
    return result;
}
