import { ExtendedClient, ExtendedWalletClient } from "../client";
import { logger } from './logger';
import { parseEventLogs, formatUnits, Hex } from "viem";
import { Config } from "../config";

export async function pChainImport(client: ExtendedWalletClient): Promise<{ txID: string }> {
  const { P: pAddress } = client.addresses;
  const importTxnRequest = await client.pChain.prepareImportTxn({
    sourceChain: 'C',
    importedOutput: { addresses: [pAddress] },
  });
  const response = await client.sendXPTransaction(importTxnRequest);
  await client.waitForTxn(response);
  return { txID: response.txHash };
}

export async function requirePChainBallance(client: ExtendedWalletClient, amount: bigint = BigInt(0), promptUser: boolean = true, checkRetry: number = 3) {

  const { P: pAddress, C: cAddress } = client.addresses;
  let pBalance = await client.pChain.getBalance({ addresses: [pAddress] });
  let remainingPBalance = pBalance.unlocked - amount;

  for (let pTry = 0; remainingPBalance < BigInt(0) && pTry < checkRetry; pTry++) {
    if (pTry === checkRetry) throw new Error(`You don't have enough AVAX in your P-Chain address`);
    logger.log(`You have only ${formatUnits(pBalance.unlocked, 9)}/${formatUnits(amount, 9)} AVAX in your P-Chain address ${pAddress}`);

    // P-chain import fee is deducted from the imported UTXO — export more than the deficit
    const feeState = await client.pChain.getFeeState();
    const estimatedImportFee = BigInt(feeState.price) * 4135n; // ~4135 gas units for a basic import
    const exportedNAVAX = -remainingPBalance + estimatedImportFee;

    // requireCChainBallance adds the EVM gas buffer on top of the requested amount
    await requireCChainBallance(client, exportedNAVAX * BigInt(10 ** 9), promptUser, checkRetry);

    switch (promptUser ? await logger.prompt(`C-Chain address ${cAddress} has enough funds to transfer ${formatUnits(-remainingPBalance, 9)} AVAX to the P-Chain. Do you want to transfer it automatically? (y/n)`) : 'y') {
      case 'y':
        logger.log(`Exporting AVAX from C-Chain...`);
        const exportTxnRequest = await client.cChain.prepareExportTxn({
          destinationChain: 'P',
          fromAddress: cAddress,
          exportedOutput: { addresses: [pAddress], amount: exportedNAVAX },
        });
        const exportResponse = await client.sendXPTransaction(exportTxnRequest);
        await client.waitForTxn(exportResponse);
        logger.log(`Importing AVAX to P-Chain...`);
        await pChainImport(client);
        logger.log("Transfer successfully completed!");
        break;
      case 'n':
        await logger.prompt(`Please transfer ${formatUnits(amount, 9)} AVAX to the P-Chain address (${pAddress}) manually and press enter to continue...`);
        break;
      default:
        throw new Error(`Canceled by the user`);
    }

    pBalance = await client.pChain.getBalance({ addresses: [pAddress] });
    remainingPBalance = pBalance.unlocked - amount;
  }
  logger.log(`Sufficient found on the P-Chain (${formatUnits(pBalance.unlocked, 9)}/${formatUnits(amount, 9)} AVAX)`);
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
    cBalance = await client.getBalance({ address: cAddress });
    remainingCBalance = cBalance - amount;
  }
  logger.log(`Sufficient found on the C-Chain address ${cAddress} (${formatUnits(cBalance, 18)}/${formatUnits(amount, 18)} AVAX)`);
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
