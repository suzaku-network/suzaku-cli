import { utils, pvm, Context, UnsignedTx, secp256k1, L1Validator, BigIntPr, pvmSerial, PChainOwner } from "@avalabs/avalanchejs";
import { getAddresses } from "./utils";

export interface CreateChainParams {
    privateKeyHex: string;
    chainName: string;
    subnetId: string;
    genesisData: string;
}

export interface ConvertToL1Params {
    privateKeyHex: string;
    subnetId: string;
    chainId: string;
    managerAddress: `0x${string}`;
    validators: {
        nodeID: string;
        blsPublicKey: string;
        blsProofOfPossession: string;
        weight: number;
        balance: number;
    }[];
}

export interface RegisterL1ValidatorParams {
    privateKeyHex: string;
    pChainAddress: string;
    blsProofOfPossession: string;
    signedMessage: string;
}

export interface RemoveL1ValidatorParams {
    privateKeyHex: string;
    pChainAddress: string;
    validationID: string;
}

export interface SetValidatorWeightParams {
    privateKeyHex: string;
    pChainAddress: string;
    validationID: string;
    message: string;
}

export const SUBNET_EVM_ID = "dkr3SJRCf2QfRUaepreGf2PtfEtpLHuPixeBMNrf1QQBxWLNN";
const RPC_ENDPOINT = "https://api.avax-test.network"; // Replace with your actual RPC endpoint

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

export async function createSubnet(privateKeyHex: string): Promise<string> {
    if (!privateKeyHex) {
        throw new Error("Private key required");
    }

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

    const { P: pAddress } = getAddresses(privateKeyHex);
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

    await addSigToAllCreds(tx, utils.hexToBuffer(privateKeyHex));
    const response = await pvmApi.issueSignedTx(tx.getSignedTx());

    // Sleep for 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    return response.txID;
}

export async function createChain(params: CreateChainParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

    const { P: pAddress } = getAddresses(params.privateKeyHex);
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
    await new Promise(resolve => setTimeout(resolve, 3000));

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

    const { P: pAddress } = getAddresses(params.privateKeyHex);
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
    await new Promise(resolve => setTimeout(resolve, 3000));

    return response.txID;
}

export async function registerL1Validator(params: RegisterL1ValidatorParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

    const addressBytes = utils.bech32ToBytes(params.pChainAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [params.pChainAddress]
    });

    // Create a new register validator transaction
    const tx = pvm.e.newRegisterL1ValidatorTx({
        // balance: BigInt(1 * 1e9), // 1 AVAX
        balance: BigInt(1 * 1e8), // 0.1 AVAX
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
    console.log("\nRegisterL1ValidatorTx submitted to P-Chain:", response.txID);

    // Wait for transaction to be confirmed
    console.log("Waiting for P-Chain confirmation...");
    while (true) {
        let status = await pvmApi.getTxStatus({ txID: response.txID });
        if (status.status === "Committed") break;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("P-Chain transaction confirmed");

    return response.txID;
}

export async function removeL1Validator(params: RemoveL1ValidatorParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

    const addressBytes = utils.bech32ToBytes(params.pChainAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [params.pChainAddress]
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
    while (true) {
        let status = await pvmApi.getTxStatus({ txID: response.txID });
        if (status.status === "Committed") break;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("P-Chain transaction confirmed");

    return response.txID;
}

export async function setValidatorWeight(params: SetValidatorWeightParams): Promise<string> {
    if (!params.privateKeyHex) {
        throw new Error("Private key required");
    }

    const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
    const feeState = await pvmApi.getFeeState();
    const context = await Context.getContextFromURI(RPC_ENDPOINT);

    const addressBytes = utils.bech32ToBytes(params.pChainAddress);

    const { utxos } = await pvmApi.getUTXOs({
        addresses: [params.pChainAddress]
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
    while (true) {
        let status = await pvmApi.getTxStatus({ txID: response.txID });
        if (status.status === "Committed") break;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("P-Chain transaction confirmed");

    return response.txID;
}
