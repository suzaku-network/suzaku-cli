import { utils, pvm, Context, UnsignedTx, secp256k1, L1Validator, pvmSerial, PChainOwner, Common, networkIDs } from "@avalabs/avalanchejs";
import { cb58ToBytes, cb58ToHex, getAddresses, NodeId, nToAVAX } from "./utils";
import { ExtendedClient, ExtendedWalletClient, generateClient } from "../client";
import { requirePChainBallance } from "./transferUtils";
import { bytesToHex, Hex, hexToBytes } from "viem";
import { collectSignaturesInitializeValidatorSet, packL1ConversionMessage, PackL1ConversionMessageArgs, packWarpIntoAccessList } from "./warpUtils";
import { SafeSuzakuContract } from "./viemUtils";

export type GetValidatorAtObject = { [nodeId: string]: { publicKey: string, weight: BigInt } };

export interface PChainBaseParams {
    privateKeyHex: string;
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
    initialBalance: number;
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

type InitializeValidatorSetArgs = [{ l1ID: `0x${string}`; validatorManagerBlockchainID: `0x${string}`; validatorManagerAddress: `0x${string}`; initialValidators: readonly { nodeID: `0x${string}`; blsPublicKey: `0x${string}`; weight: bigint; }[]; }, number]

export function add0x(hex: string) {
    return /^0x/i.test(hex) ? hex : `0x${hex}`;
}

export const getRPCEndpoint = (client: ExtendedClient): string => {
    const url = new URL(client.chain!.rpcUrls.default.http[0]);
    return `${url.protocol}//${url.host}`;
};


async function addSigToAllCreds(
    unsignedTx: UnsignedTx,
    privateKey: Uint8Array,
) {
    const unsignedBytes = unsignedTx.toBytes();
    const publicKey = secp256k1.getPublicKey(privateKey);

    if (!unsignedTx.hasPubkey(publicKey)) {
        return;
    }

    const signature = await secp256k1.sign(unsignedBytes, privateKey);
    for (let i = 0; i < unsignedTx.getCredentials().length; i++) {
        unsignedTx.addSignatureAt(signature, i, 0);
    }
}

export async function createSubnet(params: PChainBaseParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }
    const rpcUrl = getRPCEndpoint(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pAddress } = getAddresses(params.privateKeyHex, params.client.network!);
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

    await addSigToAllCreds(tx, utils.hexToBuffer(params.privateKeyHex));
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());

    // Sleep for 3 seconds
    await waitPChainTx(response.txID, pvmApi);

    return response.txID;
}

export async function createChain(params: CreateChainParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }
    const rpcUrl = getRPCEndpoint(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pAddress } = getAddresses(params.privateKeyHex, params.client.network!);
    const addressBytes = utils.bech32ToBytes(pAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pAddress]
    });
    console.log(`Using default EVM VM ID: ${params.SubnetEVMId || "dkr3SJRCf2QfRUaepreGf2PtfEtpLHuPixeBMNrf1QQBxWLNN"}`);
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

    await addSigToAllCreds(tx, utils.hexToBuffer(params.privateKeyHex));
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());

    // Sleep for 3 seconds
    await waitPChainTx(response.txID, pvmApi);

    console.log('Created chain: ', response.txID);
    return response.txID;
}

export async function convertToL1(params: ConvertToL1Params): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }
    const rpcUrl = getRPCEndpoint(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pAddress } = getAddresses(params.privateKeyHex, params.client.network!);
    const addressBytes = utils.bech32ToBytes(pAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pAddress]
    });

    const pChainOwner = PChainOwner.fromNative([addressBytes], 1);

    // Create L1Validator instances for each validator
    const validators = params.validators.map(v => {
        const nodeID = v.nodeID;
        const publicKey = utils.hexToBuffer(v.blsPublicKey);
        const signature = utils.hexToBuffer(v.blsProofOfPossession);

        return L1Validator.fromNative(
            nodeID,
            BigInt(v.weight), // weight
            BigInt(v.balance), // balance
            new pvmSerial.ProofOfPossession(publicKey, signature),
            pChainOwner,
            pChainOwner
        );
    });

    const managerAddressBytes = utils.hexToBuffer(params.managerAddress.slice(2));

    const tx = pvm.e.newConvertSubnetToL1Tx(
        {
            feeState,
            fromAddressesBytes: [addressBytes],
            subnetId: params.subnetId,
            utxos,
            chainId: params.chainId,
            validators,
            subnetAuth: [0],
            address: managerAddressBytes,
        },
        context,
    );

    await addSigToAllCreds(tx, utils.hexToBuffer(params.privateKeyHex));
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());

    // Sleep for 3 seconds
    await waitPChainTx(response.txID, pvmApi);

    return response.txID;
}

export async function registerL1Validator(params: RegisterL1ValidatorParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }
    const rpcUrl = getRPCEndpoint(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);
    const { P: pChainAddress } = getAddresses(params.privateKeyHex, params.client.network!);

    const addressBytes = utils.bech32ToBytes(pChainAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pChainAddress]
    });

    // Create a new register validator transaction
    const tx = pvm.e.newRegisterL1ValidatorTx({
        balance: BigInt(params.initialBalance * 1e9), // e.g.: 0.1 * 1e9 = 0.1 AVAX
        blsSignature: new Uint8Array(Buffer.from(params.blsProofOfPossession.slice(2), 'hex')),
        message: new Uint8Array(Buffer.from(params.signedMessage, 'hex')),
        feeState,
        fromAddressesBytes: [addressBytes],
        utxos,
    }, context);

    // Sign the transaction
    await addSigToAllCreds(tx, utils.hexToBuffer(params.privateKeyHex));

    // Issue the signed transaction
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());
    // console.log("\nRegisterL1ValidatorTx submitted to P-Chain:", response.txID);

    // Wait for transaction to be confirmed
    // console.log("Waiting for P-Chain confirmation...");
    await waitPChainTx(response.txID, pvmApi);
    // console.log("P-Chain transaction confirmed");

    return response.txID;
}

export async function removeL1Validator(params: RemoveL1ValidatorParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }
    const rpcUrl = getRPCEndpoint(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pChainAddress } = getAddresses(params.privateKeyHex, params.client.network!);
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
    await addSigToAllCreds(tx, utils.hexToBuffer(params.privateKeyHex));

    // Issue the signed transaction
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());
    console.log("\nDisableL1ValidatorTx submitted to P-Chain:", response.txID);

    // Wait for transaction to be confirmed
    console.log("Waiting for P-Chain confirmation...");
    await waitPChainTx(response.txID, pvmApi);
    console.log("P-Chain transaction confirmed");

    return response.txID;
}

export async function getCurrentValidators(client: ExtendedClient, subnetId: string) {
    const rpcUrl = getRPCEndpoint(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);

    // Fetch the L1 validator at the specified index
    const response = await pvmApi.getCurrentValidators({
        subnetID: subnetId
    });

    return response.validators;
}

export async function getValidatorsAt(client: ExtendedClient, subnetId: string): Promise<GetValidatorAtObject> {
    const rpcUrl = getRPCEndpoint(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const currentHeight = await pvmApi.getHeight();
    console.log("L1: ", subnetId, " at height: ", currentHeight.height);
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
    const rpcUrl = getRPCEndpoint(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const currentHeight = await pvmApi.getHeight();
    console.log("L1: ", subnetId, " at height: ", currentHeight.height);
    // Fetch the L1 validator at the specified index
    const response = await pvmApi.validates({
        subnetID: subnetId,
    });

    if (!response.blockchainIDs || response.blockchainIDs.length === 0) {
        return undefined;
    }

    return response.blockchainIDs[0]; // Return the first blockchain ID (usually the only one)
}

export async function setValidatorWeight(params: SetValidatorWeightParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }
    const rpcUrl = getRPCEndpoint(params.client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);
    const { P: pChainAddress } = getAddresses(params.privateKeyHex, params.client.network!);
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
    await addSigToAllCreds(tx, utils.hexToBuffer(params.privateKeyHex));

    // Issue the signed transaction
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());
    console.log("\nSetL1ValidatorWeightTx submitted to P-Chain:", response.txID);

    // Wait for transaction to be confirmed
    console.log("Waiting for P-Chain confirmation...");
    await waitPChainTx(response.txID, pvmApi);
    console.log("P-Chain transaction confirmed");

    return response.txID;
}

export async function increasePChainValidatorBalance(
    client: ExtendedWalletClient,
    privateKeyHex: string,
    amount: number,
    validationId: string
): Promise<string> {
    if (!privateKeyHex) {
        throw new Error("Private key required");
    }
    const rpcUrl = getRPCEndpoint(client);
    const pvmApi = new pvm.PVMApi(rpcUrl);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(rpcUrl);

    const { P: pChainAddress } = getAddresses(privateKeyHex, client.network!);
    const addressBytes = utils.bech32ToBytes(pChainAddress);
    const nAVAX = BigInt(amount * 1e9); // Convert AVAX to nAVAX
    // Ensure the P-Chain address has enough balance
    await requirePChainBallance(privateKeyHex, client, nAVAX);

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
    await addSigToAllCreds(tx, utils.hexToBuffer(privateKeyHex));

    // Issue the signed transaction
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());

    // Wait for transaction to be confirmed
    await waitPChainTx(response.txID, pvmApi);

    return response.txID;
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
    const rpcEndpoint = getRPCEndpoint(client);
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
        console.log('txId', txId)
        console.log('data', data)
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
        poASecurityModule: SafeSuzakuContract['PoASecurityModule'];
        client: ExtendedWalletClient;
        privateKeyHex: string;
        validators: NodeConfig[];
    }) {
    const managerAddress = params.poASecurityModule.address;
    const { client, privateKeyHex, validators } = params;
    // 1) convert to L1
    const convertTx = await convertToL1({
        client,
        privateKeyHex: privateKeyHex,
        subnetId: params.subnetId,
        chainId: "yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp",
        managerAddress,
        validators: params.validators,
    });
    // 2) collect signatures
    const signed = await collectSignaturesInitializeValidatorSet({
        network: client.network,
        subnetId: params.subnetId,
        validatorManagerBlockchainID: "yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp",
        managerAddress,
        validators,
    });

    // 3) pack warp → accessList
    const signedBytes = hexToBytes(`0x${signed}`);
    const accessList = packWarpIntoAccessList(signedBytes);

    // 4) call initializeValidatorSet
    const args = await getValidatorManagerInitializationArgsFromWarpTx(convertTx, params.subnetId, client);
    const initHash = await params.poASecurityModule.safeWrite.initializeValidatorSet(args, {
        account: client.account!,
        chain: null,
        accessList
    });

    await client.waitForTransactionReceipt({
        hash: initHash as Hex,
        confirmations: 2
    })

    return { txHash: convertTx, initHash };

}

export async function getValidatorManagerInitializationArgsFromWarpTx(conversionTxID: string, subnetId: string, client: ExtendedClient): Promise<InitializeValidatorSetArgs> {
    const { validators, chainId, managerAddress } = await extractWarpMessageFromPChainTx(subnetId, conversionTxID, client);
    // Prepare transaction arguments
    return [
        {
            l1ID: cb58ToHex(subnetId) as Hex,
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
