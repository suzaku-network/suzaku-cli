import { pvm, evm, Context, utils, avaxSerial } from "@avalabs/avalanchejs";
import { ExtendedClient, ExtendedPublicClient, ExtendedWalletClient } from "../client";
import { addSigToAllCreds, getPchainBaseUrl, waitPChainTx } from "./pChainUtils";
import { logger } from './logger';
import { parseEventLogs, formatUnits, hexToBytes, Hex } from "viem";
import { Config } from "../config";

// Wait c chain tx until it is confirmed with a timeout
export async function waitCChainTx(txID: string, evmApi: evm.EVMApi, pollingInterval: number = 6, retryCount: number = 10) {
  let tx = await evmApi.getAtomicTxStatus(txID);
  let retry = 0;
  while (tx.status !== 'Committed' && tx.status !== 'Accepted' && retry < retryCount) {
    logger.log(`Waiting for C-Chain transaction ${txID} to be committed... (current status: ${tx.status})`);
    await new Promise(resolve => setTimeout(resolve, pollingInterval * 1000));
    tx = await evmApi.getAtomicTxStatus(txID);
    retry++;
  }
}

/*
* @notice Prepare a C-Chain export transaction
* @param privateKeyHex - The private key of the user in hex format
* @param pAddress - The P-Chain address to export AVAX from
* @param cAddress - The C-Chain address to export AVAX to
* @param client - The ExtendedWalletClient instance
* @param amount - The amount of AVAX (9 decimals as supported by the p-chain) to export
* @returns - A promise that resolves to a tuple of the signed transaction and the export fees
*/
async function prepareCchainExport(pAddress: string, cAddress: `0x${string}`, client: ExtendedWalletClient, amount: bigint): Promise<[avaxSerial.SignedTx, bigint]> {
  const rpcUrl: string = getPchainBaseUrl(client);
  const evmapi = new evm.EVMApi(rpcUrl);
  const context = await Context.getContextFromURI(rpcUrl);
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
    amount + exportFees,
    context.pBlockchainID,
    utils.hexToBuffer(cAddress),
    [pAddressBytes],
    exportFees,
    BigInt(txCount),
  );
  await addSigToAllCreds(tx, client, true);

  return [tx.getSignedTx(), exportFees]
}

export async function pChainImport(client: ExtendedWalletClient): Promise<{ txID: string }> {

  const { P: pAddress } = client.addresses;
  const rpcUrl = getPchainBaseUrl(client);
  const pvmApi = new pvm.PVMApi(rpcUrl);
  const context = await Context.getContextFromURI(rpcUrl);
  const feeState = await pvmApi.getFeeState();

  const { utxos } = await pvmApi.getUTXOs({
    sourceChain: 'C',
    addresses: [pAddress],
  });
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

  await addSigToAllCreds(importTx, client);

  return pvmApi.issueSignedTx(importTx.getSignedTx());
};

// @notice Check if the user has enough AVAX in the P-Chain address to cover the amount
// @param privateKeyHex - The private key of the user in hex format (not the address because automatic C to P Chain transfer may be supported in the future)
// @param network - The network to use (mainnet or fuji)
// @param amount - The amount of AVAX to check for (9 decimals as supported by the p-chain)
// @param signedTx - The signed transaction to check for (calculate the fees)
// @param checkRetry - The number of times to check for the amount (default: 3)
// @returns - A promise that resolves when the user has enough AVAX in the P-Chain address
// @throws - An error if the user doesn't have enough AVAX in the P-Chain address
export async function requirePChainBallance(client: ExtendedWalletClient, amount: bigint = BigInt(0), promptUser: boolean = true, signedTx?: avaxSerial.SignedTx, checkRetry: number = 3) {

  const rpcUrl = getPchainBaseUrl(client);
  const pvmApi = new pvm.PVMApi(rpcUrl);
  const evmapi = new evm.EVMApi(rpcUrl);
  const { P: pAddress, C: cAddress } = client.addresses;
  // Check on the P-Chain
  let pBalance = await pvmApi.getBalance({ addresses: [pAddress] })
  let remainingPBalance = pBalance.unlocked - amount;

  // If not enough found on the P-Chain, check the C-Chain
  for (let pTry = 0; remainingPBalance < BigInt(0) && pTry < checkRetry; pTry++) {
    if (pTry === checkRetry) throw new Error(`You don't have enough AVAX in your P-Chain address`);// Stop if too more retries on the P-Chain
    logger.log(`You have only ${formatUnits(pBalance.unlocked, 9)}/${formatUnits(amount, 9)} AVAX in your P-Chain address ${pAddress}`);

    const [cChainSignedExportTx, transferFees] = await prepareCchainExport(pAddress, cAddress, client, - remainingPBalance);
    const neededOnCchain = (transferFees - remainingPBalance) * BigInt(10 ** 9)// // Negative amount to positive (from 9 (p-chain) to 18 (c-chain) decimals) and add exportfees to get the needed amount on the C-Chain

    // Ask user to transfer AVAX to its C-Chain address if not enough found
    await requireCChainBallance(client, neededOnCchain, promptUser, checkRetry);

    let cChainExportTxResponse, pChainImportTxResponse;

    switch (promptUser ? await logger.prompt(`C-Chain address ${cAddress} have enough founds to transfer ${formatUnits(neededOnCchain, 18)} to the P-Chain address.. Do you want to transfer it automatically (y/n)`) : 'y') {
      case 'y':
        logger.log(`Exporting AVAX from C-Chain...`);
        cChainExportTxResponse = await evmapi.issueSignedTx(cChainSignedExportTx)
        logger.log(cChainExportTxResponse.txID)
        await waitCChainTx(cChainExportTxResponse.txID, evmapi);
        logger.log(`Importing AVAX to P-Chain...`);
        pChainImportTxResponse = await pChainImport(client);
        await waitPChainTx(pChainImportTxResponse.txID, pvmApi);
        logger.log("Transfer successfully completed !")
        // Call the transfer function here
        break;
      case 'n':
        await logger.prompt(`Please transfer ${formatUnits(amount, 9)} AVAX to the P-Chain address (${pAddress}) manually and press enter to continue...`);
        break;
      default:
        throw new Error(`Canceled by the user`);
    }

    pBalance = await pvmApi.getBalance({ addresses: [pAddress] })
    remainingPBalance = pBalance.unlocked - amount;
  }
  // TODO: Fix small diff issue: "Sufficient found on the P-Chain (0.099953453/0.010000000 AVAX)"
  logger.log(`Sufficient found on the P-Chain (${formatUnits(pBalance.unlocked, 9)}/${formatUnits(amount, 9)} AVAX)`)

}

export async function requireCChainBallance(client: ExtendedWalletClient, amount: bigint = BigInt(0), promptUser: boolean = true, checkRetry: number = 3) {

  const { C: cAddress } = client.addresses;
  let cBalance = await client.getBalance({ address: cAddress });
  let remainingCBalance = cBalance - amount;

  for (let cTry = 0; remainingCBalance < BigInt(0) && cTry < checkRetry; cTry++) {
    if (cTry === checkRetry) throw new Error(`You don't have enough AVAX in your C-Chain address`);
    logger.log(`You have only ${formatUnits(cBalance, 18)}/${formatUnits(amount, 18)} AVAX in your C-Chain address ${cAddress}`);
    if (!promptUser) {
      throw new Error(`You don't have enough AVAX in your C-Chain address ${cAddress}`);
    }
    await logger.prompt(`Please transfer ${formatUnits(amount, 18)} AVAX to the C-Chain address (${cAddress}) manually and press enter to continue...`);
    cBalance = await client.getBalance({ address: cAddress });// ETH to AVAX decimals
    remainingCBalance = cBalance - amount;
  }
  logger.log(`Sufficient found on the C-Chain address ${cAddress} (${formatUnits(cBalance, 18)}/${formatUnits(amount, 18)} AVAX)`)
  return cBalance;
}

export async function getERC20Events(hash: `0x${string}`, config: Config<ExtendedClient>) {
  const receipt = await config.client.getTransactionReceipt({ hash });
  const logs = parseEventLogs({
    abi: config.abis.ERC20,
    logs: receipt.logs,
  });
  return logs;
}
