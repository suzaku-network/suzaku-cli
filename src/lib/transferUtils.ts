import { evm } from "@avalabs/avalanchejs";
import { logger } from './logger';
import { parseEventLogs } from "viem";
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

export async function getERC20Events(hash: `0x${string}`, config: Config) {
  const receipt = await config.client.getTransactionReceipt({ hash });
  const logs = parseEventLogs({
    abi: config.abis.ERC20,
    logs: receipt.logs,
  });
  return logs;
}
