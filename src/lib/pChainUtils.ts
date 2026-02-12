import { utils, pvm, Context, UnsignedTx, secp256k1, L1Validator, pvmSerial, PChainOwner, networkIDs } from "@avalabs/avalanchejs";
import { cb58ToHex, getAddresses, NodeId } from "./utils";
import { ExtendedClient, ExtendedWalletClient } from "../client";
import { requirePChainBallance } from "./transferUtils";
import { Chain, createWalletClient, defineChain, Hex, hexToBytes, http, publicActions, toBytes } from "viem";
import { collectSignaturesInitializeValidatorSet, packL1ConversionMessage, PackL1ConversionMessageArgs, packWarpIntoAccessList } from "./warpUtils";
import { SafeSuzakuContract } from "./viemUtils";
import { color } from "console-log-colors";
import { pipe, R, Result } from "@mobily/ts-belt";
import { logger } from './logger';
import { sha256 } from '@noble/hashes/sha256';
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
    message: string;
    justification: string;
    subnetId: string;
    signingSubnetId: string;
    networkId: typeof networkIDs.FujiID | typeof networkIDs.MainnetID;
    validators: Validator[];
    chainId: string;
    managerAddress: string;
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

interface ConversionDataResponse {
    result: TransactionResult;
}

type InitializeValidatorSetArgs = [{ subnetID: `0x${string}`; validatorManagerBlockchainID: `0x${string}`; validatorManagerAddress: `0x${string}`; initialValidators: readonly { nodeID: `0x${string}`; blsPublicKey: `0x${string}`; weight: bigint; }[]; }, number]

export function add0x(hex: string) {
    return /^0x/i.test(hex) ? hex : `0x${hex}`;
}

export const getRPCEndpoint = (client: ExtendedClient): string => {
    const url = new URL(client.chain!.rpcUrls.default.http[0]);
    return `${url.protocol}//${url.host}`;
};

export const getPchainBaseUrl = (client: ExtendedClient): string => {
    const url = new URL(client.network === 'fuji' ? avalancheFuji.rpcUrls.default.http[0] : avalanche.rpcUrls.default.http[0])
    return `${url.protocol}//${url.host}`;
}


export async function addSigToAllCreds(
    unsignedTx: UnsignedTx,
    client: ExtendedWalletClient,
    cChain = false
) {
    const unsignedBytes = unsignedTx.toBytes();
    const hash = '0x' + Buffer.from(sha256(unsignedBytes)).toString('hex') as Hex
    // Bypass EIP-193
    let signer: (parameters: { hash: Hex }) => Promise<Hex>;
    if (client.account!.cSign && cChain) {
        signer = client.account!.cSign;
    } else {
        signer = client.account!.sign!;
    }

    const signatureV2 = hexToBytes(await signer({ hash }))
    signatureV2[64] = signatureV2[64] - 27
    if (!signatureV2) {
        throw new Error("Failed to sign message");
    }
    for (let i = 0; i < unsignedTx.getCredentials().length; i++) {
        unsignedTx.addSignatureAt(signatureV2, i, 0);
    }
}

export async function createSubnet(params: PChainBaseParams): Promise<Hex> {
    const rpcUrl = getPchainBaseUrl(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pAddress } = params.client.addresses;
    const addressBytes = utils.bech32ToBytes(pAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pAddress]
    });

    const tx = pvm.e.newCreateSubnetTx(
        {
            feeState,
            fromAddressesBytes: [addressBytes],
            utxos,
            subnetOwners: [addressBytes],
        },
        context,
    );
    await addSigToAllCreds(tx, params.client);
    const res = await issueSignedTx(pvmApi, tx)
    const txID = R.getExn(res)

    return txID;
}

export async function createChain(params: CreateChainParams): Promise<Hex> {
    const rpcUrl = getPchainBaseUrl(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pAddress } = params.client.addresses;
    const addressBytes = utils.bech32ToBytes(pAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pAddress]
    });
    logger.log(`Using default EVM VM ID: ${params.SubnetEVMId || "dkr3SJRCf2QfRUaepreGf2PtfEtpLHuPixeBMNrf1QQBxWLNN"}`);
    const tx = pvm.e.newCreateChainTx(
        {
            feeState,
            fromAddressesBytes: [addressBytes],
            utxos,
            chainName: params.chainName,
            subnetAuth: [0],
            subnetId: params.subnetId,
            vmId: params.SubnetEVMId || "dkr3SJRCf2QfRUaepreGf2PtfEtpLHuPixeBMNrf1QQBxWLNN", // Default to EVM VM ID
            fxIds: [],
            genesisData: JSON.parse(params.genesisData),
        },
        context,
    );

    await addSigToAllCreds(tx, params.client);
    const txID = R.getExn(await issueSignedTx(pvmApi, tx))

    logger.log('Created chain: ', txID);
    return txID;
}

// export async function convertToL1(params: ConvertToL1Params): Promise<string> {
//     const rpcUrl = getPchainBaseUrl(params.client);
//     const pvmApi = new pvm.PVMApi(rpcUrl);
//     const feeState = await pvmApi.getFeeState();
//     const context = await Context.getContextFromURI(rpcUrl);

//     const { P: pAddress } = params.client.addresses;
//     const addressBytes = utils.bech32ToBytes(pAddress);

//     const { utxos } = await pvmApi.getUTXOs({
//         addresses: [pAddress]
//     });

//     const pChainOwner = PChainOwner.fromNative([addressBytes], 1);

//     // Create L1Validator instances for each validator
//     const validators = params.validators.map(v => {
//         const nodeID = v.nodeID;
//         const publicKey = utils.hexToBuffer(v.blsPublicKey);
//         const signature = utils.hexToBuffer(v.blsProofOfPossession);

//         return L1Validator.fromNative(
//             nodeID,
//             BigInt(v.weight), // weight
//             BigInt(v.balance), // balance
//             new pvmSerial.ProofOfPossession(publicKey, signature),
//             pChainOwner,
//             pChainOwner
//         );
//     });

//     const managerAddressBytes = utils.hexToBuffer(params.managerAddress.slice(2));

//     const tx = pvm.e.newConvertSubnetToL1Tx(
//         {
//             feeState,
//             fromAddressesBytes: [addressBytes],
//             subnetId: params.subnetId,
//             utxos,
//             chainId: params.chainId,
//             validators,
//             subnetAuth: [0],
//             address: managerAddressBytes,
//         },
//         context,
//     );

//     await addSigToAllCreds(tx, params.client);
//     const txID = await sendSignedTx(pvmApi, tx);

//     // Sleep for 3 seconds
//     await waitPChainTx(txID, pvmApi);

//     return txID;
// }

export async function convertToL1(params: ConvertToL1Params): Promise<Hex> {
    const rpcUrl = getPchainBaseUrl(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pAddress } = params.client.addresses;
    const addressBytes = utils.bech32ToBytes(pAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pAddress]
    });

    const pChainOwner = PChainOwner.fromNative([addressBytes], 1);

    const validators: L1Validator[] = params.validators.map(validator => L1Validator.fromNative(
        validator.nodeID,
        BigInt(validator.weight),
        BigInt(validator.balance),
        new pvmSerial.ProofOfPossession(utils.hexToBuffer(validator.blsPublicKey), utils.hexToBuffer(validator.blsProofOfPossession)),
        pChainOwner,
        pChainOwner
    ));

    const tx = pvm.e.newConvertSubnetToL1Tx(
        {
            feeState,
            fromAddressesBytes: [utils.bech32ToBytes(pAddress)],
            subnetId: params.subnetId,
            utxos,
            chainId: params.chainId,
            validators,
            subnetAuth: [0],
            address: utils.hexToBuffer(params.managerAddress.replace('0x', '')),
        },
        context,
    );

    await addSigToAllCreds(tx, params.client);
    const txID = R.getExn(await issueSignedTx(pvmApi, tx))

    return txID;
}

export async function registerL1Validator(params: RegisterL1ValidatorParams): Promise<Result<Hex, string>> {
    const rpcUrl = getPchainBaseUrl(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);
    const { P: pChainAddress } = params.client.addresses;

    const addressBytes = utils.bech32ToBytes(pChainAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pChainAddress]
    });

    // Create a new register validator transaction
    const tx = pvm.e.newRegisterL1ValidatorTx({
        balance: params.initialBalance,
        blsSignature: new Uint8Array(Buffer.from(params.blsProofOfPossession.slice(2), 'hex')),
        message: new Uint8Array(Buffer.from(params.signedMessage, 'hex')),
        feeState,
        fromAddressesBytes: [addressBytes],
        utxos,
    }, context);

    // Sign the transaction
    await addSigToAllCreds(tx, params.client);

    // Issue the signed transaction
    const txID = await issueSignedTx(pvmApi, tx);

    return txID;
}

export async function removeL1Validator(params: RemoveL1ValidatorParams): Promise<Result<string, string>> {
    const rpcUrl = getPchainBaseUrl(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pChainAddress } = params.client.addresses;
    const addressBytes = utils.bech32ToBytes(pChainAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pChainAddress]
    });

    // Create a new disable validator transaction
    const tx = pvm.e.newDisableL1ValidatorTx(
        {
            feeState,
            fromAddressesBytes: [addressBytes],
            disableAuth: [0],
            validationId: params.validationID,
            utxos,
        },
        context,
    );

    // Sign the transaction
    await addSigToAllCreds(tx, params.client);

    // Issue the signed transaction
    const txID = await issueSignedTx(pvmApi, tx);

    return txID;
}

type ValidatorsResponsePatched = (pvm.GetCurrentValidatorsResponse['validators'][number] & { balance?: number, validationID?: string })[];

export async function getCurrentValidators(client: ExtendedClient, subnetId: string): Promise<ValidatorsResponsePatched> {
    const rpcUrl = getPchainBaseUrl(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    // Fetch the L1 validator at the specified index
    const response = await pvmApi.getCurrentValidators({
        subnetID: subnetId
    });
    return response.validators;
}

export async function getValidatorsAt(client: ExtendedClient, subnetId: string): Promise<GetValidatorAtObject> {
    const rpcUrl = getPchainBaseUrl(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const currentHeight = await pvmApi.getHeight();
    logger.log("L1: ", subnetId, " at height: ", currentHeight.height);
    // Fetch the L1 validator at the specified index
    const response = await pvmApi.getValidatorsAt({
        subnetID: subnetId,
        height: currentHeight.height,
    });

    if (!response.validators) {
        return {};
    }

    return response.validators as GetValidatorAtObject;
}

export async function validates(client: ExtendedClient, subnetId: string): Promise<string | undefined> {
    const rpcUrl = getPchainBaseUrl(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const currentHeight = await pvmApi.getHeight();
    logger.log("L1: ", subnetId, " at height: ", currentHeight.height);
    // Fetch the L1 validator at the specified index
    const response = await pvmApi.validates({
        subnetID: subnetId,
    });

    if (!response.blockchainIDs || response.blockchainIDs.length === 0) {
        return undefined;
    }

    return response.blockchainIDs[0]; // Return the first blockchain ID (usually the only one)
}

export async function setValidatorWeight(params: SetValidatorWeightParams): Promise<Result<string, string>> {
    const rpcUrl = getPchainBaseUrl(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);
    const { P: pChainAddress } = params.client.addresses;
    const addressBytes = utils.bech32ToBytes(pChainAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pChainAddress]
    });

    // Create a new set validator weight transaction
    const tx = pvm.e.newSetL1ValidatorWeightTx(
        {
            feeState,
            fromAddressesBytes: [addressBytes],
            message: new Uint8Array(Buffer.from(params.message, 'hex')),
            utxos,
        },
        context,
    );

    // Sign the transaction
    await addSigToAllCreds(tx, params.client);

    // Issue the signed transaction
    const txID = await issueSignedTx(pvmApi, tx);

    return txID;
}

export async function increasePChainValidatorBalance(
    client: ExtendedWalletClient,
    amount: number,
    validationId: string,
    check: boolean = true
): Promise<Result<Hex, string>> {
    const rpcUrl = getPchainBaseUrl(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pChainAddress } = client.addresses;
    const addressBytes = utils.bech32ToBytes(pChainAddress);
    const nAVAX = BigInt(Math.floor(amount * 1e9)); // Convert AVAX to nAVAX
    // Ensure the P-Chain address has enough balance
    if (check) await requirePChainBallance(client, nAVAX);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pChainAddress]
    });

    // Create a new increase balance transaction
    const tx = pvm.e.newIncreaseL1ValidatorBalanceTx(
        {
            feeState,
            fromAddressesBytes: [addressBytes],
            utxos,
            balance: nAVAX, // Convert to nAVAX
            validationId
        },
        context,
    );

    // Sign the transaction
    await addSigToAllCreds(tx, client);

    // Issue the signed transaction
    const txID = await issueSignedTx(pvmApi, tx);

    return txID;
}

// Wait p chain tx until it is confirmed with a timeout
export async function waitPChainTx(txID: string, pvmApi: pvm.PVMApi, pollingInterval: number = 3, retryCount: number = 10) {
    let response = await pvmApi.getTxStatus({ txID });
    let retry = 0;
    while (response.status !== 'Committed' && retry < retryCount) {
        response = await pvmApi.getTxStatus({ txID });
        await new Promise(resolve => setTimeout(resolve, pollingInterval * 1000));
        retry++;
    }
    if (response.status !== 'Committed') {
        throw new Error(`P-Chain transaction ${txID} not committed after ${retryCount} retries`);
    }
}

export async function extractWarpMessageFromPChainTx(subnetId: string, txId: string, client: ExtendedClient): Promise<ExtractWarpMessageFromTxResponse> {
    const rpcEndpoint = getPchainBaseUrl(client);
    const networkId = networkIDs.FujiID;

    //Fixme: here we do a direct call instead of using avalanchejs, because we need to get the raw response from the node
    const response = await fetch(rpcEndpoint + "/ext/bc/P", {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'platform.getTx',
            params: {
                txID: txId,
                encoding: 'json'
            },
            id: 1
        })
    });

    const data = await response.json() as ConversionDataResponse

    if (!data?.result?.tx?.unsignedTx?.subnetID || !data?.result?.tx?.unsignedTx?.chainID || !data?.result?.tx?.unsignedTx?.address || !data?.result?.tx?.unsignedTx?.validators) {
        logger.log('txId', txId)
        logger.log('data', data)
        throw new Error("Invalid transaction data, are you sure this is a conversion transaction?");
    }

    const conversionArgs: PackL1ConversionMessageArgs = {
        subnetId: data.result.tx.unsignedTx.subnetID,
        managerChainID: data.result.tx.unsignedTx.chainID,
        managerAddress: data.result.tx.unsignedTx.address as Hex,
        validators: data.result.tx.unsignedTx.validators.map((validator) => {
            return {
                nodeID: validator.nodeID,
                nodePOP: validator.signer,
                weight: validator.weight
            }
        })
    };

    const [message, justification] = packL1ConversionMessage(conversionArgs, networkId, data.result.tx.unsignedTx.blockchainID);
    return {
        message: utils.bufferToHex(message),
        justification: utils.bufferToHex(justification),
        subnetId: data.result.tx.unsignedTx.subnetID,
        signingSubnetId: subnetId,
        networkId,
        validators: data.result.tx.unsignedTx.validators,
        chainId: data.result.tx.unsignedTx.chainID,
        managerAddress: data.result.tx.unsignedTx.address,
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
        validatorManager: Hex, //SafeSuzakuContract['ValidatorManager'];
        client: ExtendedWalletClient;
        validators: NodeConfig[];
        validatorManagerBlockchainID: string;
    }) {
    const managerAddress = params.validatorManager;
    const { client, validators } = params;
    // 1) convert to L1
    // const convertTx = await convertToL1({
    //     client,
    //     subnetId: params.subnetId,
    //     chainId: params.validatorManagerBlockchainID,
    //     managerAddress,
    //     validators,
    // });
    const convertTx = "HVazXbUZomoMwtppWoZ5PdLNei6GrbAtLjGE9iAFhBKmhQLfQ"
    // 2) collect signatures
    // const signed = await collectSignaturesInitializeValidatorSet({
    //     network: client.network,
    //     subnetId: params.subnetId,
    //     validatorManagerBlockchainID: params.validatorManagerBlockchainID,
    //     managerAddress,
    //     validators,
    // });

    // 3) pack warp → accessList
    const signedBytes = hexToBytes("0x0000000000050000000000000000000000000000000000000000000000000000000000000000000000340000000000010000000000000026000000000000514d9cd0c9156ed54816f5a2a202400c4161ea5eb4392b02488ed58e0cc5fd0a00000000000000010389a5fc416db5c31fc216f08e97b31544690c9d073364265af8c08dfc6e5e33daa200e4b3a5e4c90431f66b31248f49880e8dceeaf9916a3728df4a0f0451cd2e06fdc6f8287bba532cca94f282ca1560865dd296468bfe6fd7cfda9533588269");
    const accessList = packWarpIntoAccessList(signedBytes);

    // 4) call initializeValidatorSet
    // client.chain = chain;
    const args = await getValidatorManagerInitializationArgsFromWarpTx(convertTx, params.subnetId, client);

    const config = await getConfig(client as ExtendedClient, 2, true)
    const validatorManager = await config.contracts.ValidatorManager(params.validatorManager)
    // const init = {
    //     admin: client.addresses.C,
    //     subnetID: args[0].subnetID,
    //     churnPeriodSeconds: 10n,
    //     maximumChurnPercentage: 20,
    // }
    // await validatorManager.safeWrite.initialize([init])
    const initHash = await validatorManager.safeWrite.initializeValidatorSet(args, {
        account: client.account!,
        chain: null,
        accessList
    });

    return { txHash: convertTx };

}

export async function getValidatorManagerInitializationArgsFromWarpTx(conversionTxID: string, subnetId: string, client: ExtendedClient): Promise<InitializeValidatorSetArgs> {
    const { validators, chainId, managerAddress } = await extractWarpMessageFromPChainTx(subnetId, conversionTxID, client);
    // Prepare transaction arguments
    return [
        {
            subnetID: cb58ToHex(subnetId) as Hex,
            validatorManagerBlockchainID: cb58ToHex(chainId) as Hex,
            validatorManagerAddress: managerAddress as Hex,
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

export async function issueSignedTx(pvmApi: pvm.PVMApi, tx: UnsignedTx): Promise<Result<Hex, string>> {
    const result = pipe(await R.fromPromise(pvmApi.issueSignedTx(tx.getSignedTx())),
        R.map(res => res.txID as Hex),
        R.mapError(err => "\n" + color.red(`Error issuing P-Chain Signed Tx:`) + `\n${err.message}`)
    )
    if (R.isOk(result)) await waitPChainTx(result._0, pvmApi);// else await logger.exitError([result._0])
    return result;
}
