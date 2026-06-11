import { SafeClient } from "@safe-global/sdk-starter-kit";
import { Abi, decodeFunctionData, getAddress, Hex } from "viem";
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
  action: 'confirm' | 'skip' | 'new' | 'propose';
}

/**
 * ALLOW_SAFE_DELEGATE_MAINNET grants a software key the right to PROPOSE only.
 * An owner key would take the execute branches (send/confirm) instead of proposing,
 * so it is refused outright while the opt-in is active — this is the safety pairing
 * for the mainnet guard relaxation in cliParser.ts / cli.ts.
 */
function assertDelegateOnly(isOwner: boolean): void {
  if (process.env.ALLOW_SAFE_DELEGATE_MAINNET === 'true' && isOwner) {
    logger.exitError(['ALLOW_SAFE_DELEGATE_MAINNET is set but the signer is a Safe OWNER; this mode only permits delegate (propose-only) keys. Unset the env var to transact as an owner.']);
  }
}

/**
 * Human-facing link to review a proposal: the Safe web UI queue on mainnet, the
 * Ash-hosted transaction-service API on fuji (no public Safe UI fronts it).
 */
export function safeQueueUrl(network: string, safeAddress: string): string {
  return network === 'fuji'
    ? `https://wallet-transaction-fuji.ash.center/api/v1/safes/${safeAddress}/multisig-transactions/?executed=false`
    : `https://app.safe.global/transactions/queue?safe=avax:${safeAddress}`;
}

export interface SafeBatchTx {
  to: Hex;
  data: Hex;
  value: string;
}

interface BatchTransactionResponse {
  safeTxHash: Hex;
  ethereumTxHash?: Hex;
  action: 'new' | 'propose' | 'skip';
}

/**
 * Send or propose several calls as ONE atomic MultiSend Safe transaction.
 * Used where sequential per-call proposals would break: they would collide on the
 * Safe nonce, and a later call's simulation can revert on state an earlier call
 * has not yet produced (e.g. set-amount pulls tokens the approve has not granted
 * until it is mined).
 */
export async function handleBatchTransaction(
  txs: SafeBatchTx[],
  client: SafeClient,
  clientAddress: Hex,
  network: string,
): Promise<BatchTransactionResponse> {
  const sender = getAddress(clientAddress);
  clientAddress = clientAddress.toLowerCase() as Hex;
  const [safeAddress, nonce] = await Promise.all([client.getAddress(), client.getNonce()]);

  const owners = (await client.getOwners()).map((o) => o.toLowerCase());
  const delegates = (await client.apiKit.getSafeDelegates({ safeAddress })).results.map((d) => d.delegate.toLowerCase());
  const isOwner = owners.includes(clientAddress);

  if (!isOwner && !delegates.includes(clientAddress)) {
    logger.exitError(['You are neither an owner or a delegate of this Safe']);
  }
  assertDelegateOnly(isOwner);

  // Pin the nonce we just read so the hash is deterministic across reruns (idempotency)
  // and the delegate proposal below is internally consistent under a concurrent-nonce race.
  const safeTransaction = await client.protocolKit.createTransaction({ transactions: txs, options: { nonce } });
  const safeTxHash = await client.protocolKit.getTransactionHash(safeTransaction) as Hex;
  const queueUrl = safeQueueUrl(network, safeAddress);
  logger.addData('safeQueueUrl', queueUrl);

  // Idempotency: an identical pending batch hashes to the same safeTxHash — skip it.
  const pendingTxs = await client.apiKit.getPendingTransactions(safeAddress, { currentNonce: nonce });
  if (pendingTxs.results.some((tx) => tx.safeTxHash === safeTxHash)) {
    logger.addData('safeTxHash', safeTxHash);
    logger.log(`Safe batch ${safeTxHash} is already pending. Skipping.`);
    return { safeTxHash, action: 'skip' };
  }

  if (isOwner) {
    logger.debug(`Sending a new Safe batch transaction as owner`);
    const result = await client.send({ transactions: txs });
    const sent = result.transactions as { ethereumTxHash?: Hex; safeTxHash?: Hex } | undefined;
    const ethereumTxHash = sent?.ethereumTxHash;
    // send() rebuilds the tx internally and may land on a different nonce under a race —
    // trust the hash it reports (execute path leaves it unset; fall back to ours).
    const resolvedSafeTxHash = (sent?.safeTxHash ?? safeTxHash) as Hex;
    logger.addData('safeTxHash', resolvedSafeTxHash);
    return { safeTxHash: resolvedSafeTxHash, ethereumTxHash, action: 'new' };
  }

  logger.addData('safeTxHash', safeTxHash);
  logger.debug(`Proposing a Safe batch transaction as delegate`);
  const signature = await client.protocolKit.signHash(safeTxHash);
  await client.apiKit.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: sender,
    senderSignature: signature.data,
  });
  logger.log(`Proposed Safe batch transaction ${safeTxHash}\nReview and sign: ${queueUrl}`);
  return { safeTxHash, action: 'propose' };
}

/**
 * Safe transaction management strategy (ledger support integrated):
 * 1. Search for similar pending transactions in the Safe.
 * 2. Exact match:
 *    - If already signed by the user: Ignore the transaction (Skip).
 *    - If not signed: Automatically confirm the existing transaction.
 * 3. Partial match (same function, different arguments):
 *    - Display an interactive menu.
 *    - Options: Confirm an existing transaction, Create a new one, or Skip all.
 * 4. No match: Create a new transaction.
 * 5. Proposal: Create a new proposal if the client is not an owner (If you're not a proposer, It will result as an error).
 */
export async function handleTransactionStrategy(
  transaction: { to: Hex, data: Hex, value: string | number },
  client: SafeClient,
  abi: Abi,
  clientAddress: Hex): Promise<TransactionStrategyResponse> {
  clientAddress = clientAddress.toLowerCase() as Hex
  const [safeAddress, nonce] = await Promise.all([client.getAddress(), client.getNonce()]);
  const pendingTxs = await client.apiKit.getPendingTransactions(safeAddress, { currentNonce: nonce })

  // Determine if the client is an owner or a proposer (a delegate)
  const owners = (await client.getOwners()).map((o) => o.toLowerCase())
  const delegates = (await client.apiKit.getSafeDelegates({ safeAddress })).results.map((d) => d.delegate.toLowerCase())
  const newOrProposal = owners.includes(clientAddress) ? 'new' : 'propose'

  if (newOrProposal === 'propose' && !delegates.includes(clientAddress)) {
    logger.exitError(['You are neither an owner or a delegate of this Safe'])
  }
  assertDelegateOnly(owners.includes(clientAddress));

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
      return { action: 'skip', hash: exactMatch.safeTxHash };
    }
    logger.log(`Transaction ${exactMatch.safeTxHash} matches exactly. ${newOrProposal === 'propose' ? 'Already proposed.' : 'Confirming.'}`);
    return { hash: exactMatch.safeTxHash, action: newOrProposal === 'propose' ? 'skip' : 'confirm' };
  }

  // Prompt a message which summarizes the pending transactions and asks the user to choose between available actions: 'confirm' | 'skip' | 'new'.
  if (selections.length > 0) {
    // Non-interactive runs (--json or no TTY) cannot answer the prompt: logger.prompt
    // returns 'y' in json mode (never a valid choice) and readline hangs on a silent
    // stdin pipe. Surface the partial matches and fall through to the default action.
    if (logger.getConfig().jsonMode || !process.stdin.isTTY) {
      logger.log(`Found ${selections.length} similar pending Safe transaction(s); defaulting to '${newOrProposal}'.`);
      logger.addData('similarPendingSafeTxs', selections.map((sel) => ({
        safeTxHash: sel.safeTxHash,
        callSignature: sel.callSignature,
        nonce: sel.txNonce,
        signed: sel.signed,
      })));
      return { action: newOrProposal };
    }

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
        return { action: newOrProposal };
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
  return { action: newOrProposal };
}
