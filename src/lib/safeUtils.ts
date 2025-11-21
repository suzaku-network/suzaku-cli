import { SafeClient } from "@safe-global/sdk-starter-kit";
import { Hex, SafeTransaction } from "@safe-global/types-kit";
import { Abi, decodeFunctionData } from "viem";
import { logger } from "./logger";

interface SelectedTx {
  safeTxHash: Hex;
  txNonce: number;
  callSignature: string;
  signed: boolean;
  partial: boolean;
}

interface TransactionStrategyResponse {
  hash?: Hex;
  nonce?: number;
  action: 'confirm' | 'reject' | 'skip' | 'new';
}

export async function handleTransactionStrategy(
  transaction: { to: Hex, data: Hex, value: string | number },
  client: SafeClient,
  abi: Abi,
  clientAddress: Hex): Promise<TransactionStrategyResponse> {

  const [safeAddress, nonce] = await Promise.all([client.getAddress(), client.getNonce()]);
  const pendingTxs = await client.apiKit.getPendingTransactions(safeAddress, { currentNonce: nonce })

  const selections = pendingTxs.results.reduce((acc, tx) => {
    // filter similar method calls
    if (tx.to === transaction.to && tx.data?.startsWith(transaction.data?.slice(0, 10))) {

      const data = decodeFunctionData({
        abi,
        data: tx.data as Hex
      });

      const alreadyConfirmed = tx.confirmations?.find((conf) => conf.owner === clientAddress);

      acc.push({
        safeTxHash: tx.safeTxHash as Hex,
        callSignature: `${data.functionName}(${data.args?.join(', ')})`,
        signed: alreadyConfirmed ? true : false,
        partial: !(tx.data === transaction.data && tx.value === transaction.value),
        txNonce: Number(tx.nonce)
      });

    }
    return acc;

  }, [] as SelectedTx[]);

  // Check for exact match
  const exactMatch = selections.find(s => !s.partial);
  if (exactMatch) {
    if (exactMatch.signed) {
      logger.log(`Transaction ${exactMatch.safeTxHash} matches exactly and is already confirmed. Skipping.`);
      return { action: 'skip' };
    }
    logger.log(`Transaction ${exactMatch.safeTxHash} matches exactly. Confirming.`);
    return { hash: exactMatch.safeTxHash, action: 'confirm' };
  }

  // Prompt a message which summarizes the pending transactions and asks the user to choose between available actions: 'confirm' | 'skip' | 'new'.
  if (selections.length > 0) {
    let promptMessage = `Similar pending transactions found in the Safe:\n`;
    selections.forEach((sel, index) => {
      promptMessage += `[${index + 1}] ${sel.safeTxHash}:\n  ${sel.callSignature} - ${sel.signed ? 'signed' : 'unsigned'} - similar\n`;
    });
    promptMessage += `\nChoose an action:\n`;
    selections.forEach((sel, index) => {
      if (!sel.signed) {
        promptMessage += `  [${index + 1}] Confirm transaction ${sel.safeTxHash}\n`;
      }
    });
    promptMessage += `  [s] Skip all pending transactions\n  [n] Create a new transaction\nYour choice: `;

    // Loop 3 times until valid response
    let retryCount = 0;
    while (retryCount < 3) {
      const answer = await logger.prompt(promptMessage);

      if (answer === 's') {
        return { action: 'skip' };
      } else if (answer === 'n') {
        return { action: 'new' };
      } else {
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < selections.length && !selections[index].signed) {
          return { hash: selections[index].safeTxHash, action: 'confirm' };
        }
      }
      logger.log(`Invalid choice, please try again.`);
      retryCount++;
    }
    logger.exitError(['Retry count exceeded'])
  }
  return { action: 'new' };
}
