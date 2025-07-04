import { pvm, evm, addTxSignatures, Context, utils, avaxSerial, EVMUnsignedTx } from "@avalabs/avalanchejs";
import { getAddresses, nToAVAX } from "./utils";
import { ExtendedWalletClient } from "../client";
import { RPC_ENDPOINT, waitPChainTx } from "./pChainUtils";
import { prompt } from "./utils";

// Wait c chain tx until it is confirmed with a timeout
export async function waitCChainTx(txID: string, evmApi: evm.EVMApi, pollingInterval: number = 6, retryCount: number = 10) {
  let tx = await evmApi.getAtomicTxStatus( txID );
  let retry = 0;
  while (tx.status !== 'Committed' && tx.status !== 'Accepted' && retry < retryCount) {
    console.log(`Waiting for C-Chain transaction ${txID} to be committed... (current status: ${tx.status})`);
    await new Promise(resolve => setTimeout(resolve, pollingInterval * 1000));
    tx = await evmApi.getAtomicTxStatus(txID);
    retry++;
  }
}

async function prepareCchainExport(privateKeyHex: string, pAddress: string, cAddress: `0x${string}`, client: ExtendedWalletClient, amount: bigint): Promise<[avaxSerial.SignedTx, bigint]> {

  const evmapi = new evm.EVMApi(RPC_ENDPOINT);
  const context = await Context.getContextFromURI(RPC_ENDPOINT);
  const txCount = await client.getTransactionCount({ address: cAddress });
  const baseFee = await evmapi.getBaseFee();
  const pAddressBytes = utils.bech32ToBytes(pAddress);

  const exportFees = evm.estimateExportCost(
    context,
    baseFee,
    amount,
    context.pBlockchainID,
    utils.hexToBuffer(cAddress),
    [pAddressBytes],
    BigInt(txCount),
  )

  const tx = evm.newExportTx(
    context,
    amount,
    context.pBlockchainID,
    utils.hexToBuffer(cAddress),
    [pAddressBytes],
    exportFees,
    BigInt(txCount),
  );
  await addTxSignatures({
    unsignedTx: tx,
    privateKeys: [utils.hexToBuffer(privateKeyHex)],
  });

  

  return [tx.getSignedTx(), exportFees]
}

export async function pChainImport(client: ExtendedWalletClient, privateKeyHex: string) {

  const { P: pAddress } = getAddresses(privateKeyHex, client.network);

  const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
  const context = await Context.getContextFromURI(RPC_ENDPOINT);
  const feeState = await pvmApi.getFeeState();

  

  const { utxos } = await pvmApi.getUTXOs({
    sourceChain: 'C',
    addresses: [pAddress],
  });
  console.log(utxos)
  console.log(utils.bech32ToBytes(pAddress))
  const importTx = pvm.newImportTx(
    {
      feeState,
      sourceChainId: context.cBlockchainID,
      utxos,
      toAddressesBytes: [utils.bech32ToBytes(pAddress)],
      fromAddressesBytes: [utils.bech32ToBytes(pAddress.replace('P-', 'C-'))], // Convert P-Chain address to C-Chain address
    },
    context
  );

  await addTxSignatures({
    unsignedTx: importTx,
    privateKeys: [utils.hexToBuffer(privateKeyHex)],
  });

  return pvmApi.issueSignedTx(importTx.getSignedTx());
};

// @notice Check if the user has enough AVAX in the P-Chain address to cover the amount
// @param privateKeyHex - The private key of the user in hex format (not the address because automatic C to P Chain transfer may be supported in the future)
// @param network - The network to use (mainnet or fuji)
// @param amount - The amount of AVAX to check for
// @param signedTx - The signed transaction to check for (calculate the fees)
// @param checkRetry - The number of times to check for the amount (default: 3)
// @returns - A promise that resolves when the user has enough AVAX in the P-Chain address
// @throws - An error if the user doesn't have enough AVAX in the P-Chain address
export async function requirePChainBallance(privateKeyHex: string, client: ExtendedWalletClient, amount: bigint = BigInt(0), signedTx?: avaxSerial.SignedTx, checkRetry: number = 3) {


  const pvmApi = new pvm.PVMApi(RPC_ENDPOINT);
  const evmapi = new evm.EVMApi(RPC_ENDPOINT);
  const { P: pAddress, C: cAddress } = getAddresses(privateKeyHex, client.network!);
  // Check on the P-Chain
  let pBalance = await pvmApi.getBalance({ addresses: [pAddress] })
  let remainingPBalance = pBalance.unlocked - amount;
  
  // If not enough found on the P-Chain, check the C-Chain
  for (let pTry = 0; remainingPBalance < BigInt(0) && pTry < checkRetry; pTry++) {
    if (pTry === checkRetry) throw new Error(`You don't have enough AVAX in your P-Chain address`);// Stop if too more retries on the P-Chain
    console.log(`You have only ${nToAVAX(pBalance.unlocked)}/${nToAVAX(amount)} AVAX in your P-Chain address ${pAddress}`);

    const [cChainSignedExportTx, transferFees] = await prepareCchainExport(privateKeyHex, pAddress, cAddress, client, - remainingPBalance);// Negative amount because of the for condition.
    const neededOnCchain = transferFees - remainingPBalance// Turn remainingPBalance positive and add fees to get the needed amount on the C-Chain
    
    // Ask user to transfer AVAX to its C-Chain address if not enough found
    const cBalance = await requireCChainBallance(privateKeyHex, client, neededOnCchain, undefined, checkRetry);

    switch (await prompt(`C-Chain address ${cAddress} have enough founds to transfer ${nToAVAX(neededOnCchain)} to the P-Chain address ${nToAVAX(neededOnCchain)}.. Do you want to transfer it automatically (y/n)`)) {
      case 'y':
        console.log(`Exporting AVAX from C-Chain...`);
        const cChainExportTxResponse = await evmapi.issueSignedTx(cChainSignedExportTx)
        console.log(cChainExportTxResponse.txID)
        await waitCChainTx(cChainExportTxResponse.txID, evmapi);
        console.log(`Importing AVAX to P-Chain...`);
        const pChainImportTxResponse = await pChainImport(client, privateKeyHex);
        await waitPChainTx(pChainImportTxResponse.txID, pvmApi);
        console.log("Transfer successfully completed !")
        // Call the transfer function here
        break;
      case 'n':
        await prompt(`Please transfer ${nToAVAX(neededOnCchain)} AVAX to the P-Chain address (${pAddress}) manually and press enter to continue...`);
        break;
      default:
        throw new Error(`Canceled by the user`);
    }
    
    pBalance = await pvmApi.getBalance({ addresses: [pAddress] })
    remainingPBalance = pBalance.unlocked - amount;
  }
  // TODO: Fix small diff issue: "Sufficient found on the P-Chain (0.099953453/0.010000000 AVAX)"
  console.log(`Sufficient found on the P-Chain (${nToAVAX(pBalance.unlocked)}/${nToAVAX(amount)} AVAX)`)

}

export async function requireCChainBallance(privateKeyHex: string, client: ExtendedWalletClient | ExtendedWalletClient, amount: bigint = BigInt(0), signedTx?: EVMUnsignedTx, checkRetry: number = 3) {

  const { C: cAddress } = getAddresses(privateKeyHex, client.network!);
  let cBalance = await client.getBalance({ address: cAddress }) / BigInt(1e9);// ETH to AVAX decimals
  let remainingCBalance = cBalance - amount;

  for (let cTry = 0; remainingCBalance < BigInt(0) && cTry < checkRetry; cTry++) {
    if (cTry === checkRetry) throw new Error(`You don't have enough AVAX in your C-Chain address`);
    console.log(`You have only ${nToAVAX(cBalance)}/${nToAVAX(amount)} AVAX in your C-Chain address ${cAddress}`);
    await prompt(`Please transfer ${nToAVAX(amount)} AVAX to the C-Chain address (${cAddress}) manually and press enter to continue...`);
    cBalance = await client.getBalance({ address: cAddress }) / BigInt(1e9);// ETH to AVAX decimals
    remainingCBalance = cBalance - amount;
  }
  console.log(`Sufficient found on the C-Chain address ${cAddress} (${nToAVAX(cBalance)}/${nToAVAX(amount)} AVAX)`)
  return cBalance;

}
