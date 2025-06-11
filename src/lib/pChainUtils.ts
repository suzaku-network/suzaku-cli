import { utils, pvm, Context, UnsignedTx, secp256k1, L1Validator, pvmSerial, PChainOwner, Common, OutputOwners } from "@avalabs/avalanchejs";
import { getAddresses, nToAVAX } from "./utils";
import { ExtendedWalletClient, generateClient } from "../client";
import { requirePChainBallance } from "./transferUtils";
import { Hex } from "viem";

export type GetValidatorAtObject = { [nodeId: string]: { publicKey: string, weight: BigInt } };

export interface PChainBaseParams {
    privateKeyHex: string;
    client: ExtendedWalletClient;
}

export interface CreateChainParams extends PChainBaseParams {
    chainName: string;
    subnetId: string;
    genesisData: string;
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

export const SUBNET_EVM_ID = "dkr3SJRCf2QfRUaepreGf2PtfEtpLHuPixeBMNrf1QQBxWLNN";
export const RPC_ENDPOINT = "https://api.avax-test.network"; // Replace with your actual RPC endpoint

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

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

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

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

    const { P: pAddress } = getAddresses(params.privateKeyHex, params.client.network!);
    const addressBytes = utils.bech32ToBytes(pAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [pAddress]
    });

    const tx = pvm.e.newCreateChainTx(
        {
            feeState,
            fromAddressesBytes: [addressBytes],
            utxos,
            chainName: params.chainName,
            subnetAuth: [0],
            subnetId: params.subnetId,
            vmId: SUBNET_EVM_ID,
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

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

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

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);
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

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

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

export async function getCurrentValidators(subnetId: string){
    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    
    // Fetch the L1 validator at the specified index
    const response = await pvmApi.getCurrentValidators({
        subnetID: subnetId
    });

    return response.validators;
}

export async function getValidatorsAt(subnetId: string): Promise<GetValidatorAtObject> {
    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
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

export async function setValidatorWeight(params: SetValidatorWeightParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);
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
