import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { getERC20, getL1Middleware, getRewardsNativeToken } from '@suzaku-network/suzaku-sdk/core';
import { type Hex, type Account, parseUnits } from 'viem';
import { logger } from './lib/logger';
import { ExtendedPublicClient } from './client';
import { ArgAddress, ArgBigInt, ArgNumber, ParserAddress } from './lib/cliParser';
import { SuzakuCliProgram } from './cli';
import { Option } from '@commander-js/extra-typings';
import { getERC20Events } from '@suzaku-network/suzaku-sdk/node';
import { argOperatorAddress } from './operator';
import { argVaultAddress } from './vault';

export const argRewardsAddress = ArgAddress("rewardsAddress", "Rewards contract address");
export const argRewardTokenAddress = ArgAddress("rewardTokenAddress", "Reward token contract address");

async function getRewardsClaimsCount(
  rewards: SuzakuContract['RewardsNativeToken'],
  client: ExtendedPublicClient,
  role: 'Staker' | 'Operator' | 'Curator',
  account: Account
) {
  const [lastEpoch, middlewareAddress, maxEpochPerClaim] = await Promise.all([
    rewards.read[`lastEpochClaimed${role}`]([account.address!] as never),
    rewards.read.middleware(),
    rewards.read.MAX_EPOCHS_PER_CLAIM()
  ]);
  const middleware = await getL1Middleware(client, middlewareAddress);
  const epoch = await middleware.read.getCurrentEpoch();
  return Math.ceil((epoch - lastEpoch) / maxEpochPerClaim);
}

export function rewardsCmd(program: SuzakuCliProgram) {
const rewardsCmd = program
  .command("rewards")
  .description("Commands for managing rewards");

rewardsCmd
  .command("distribute")
  .description("Distribute rewards for a specific epoch")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("epoch", "Epoch to distribute rewards for"))
  .addArgument(ArgNumber("batchSize", "Number of operators to process in this batch"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, epoch, batchSize) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const txHash = await rewardsContract.safeWrite.distributeRewards([epoch, batchSize]);
    logger.log(`Rewards distributed for epoch ${epoch}. tx hash: ${txHash}`);
  });

rewardsCmd
  .command("claim")
  .description("Claim rewards for a staker in batch of 64 epochs")
  .addArgument(argRewardsAddress)
  .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
  .asyncAction({ signer: true }, async (client, rewardsAddress, options) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const recipient = options.recipient ?? client.addresses.C;

    let hashs: Hex[] = [];
    for (const _ of Array.from({ length: await getRewardsClaimsCount(rewardsContract, client, 'Staker', client.account!) })) {
      hashs.push(await rewardsContract.safeWrite.claimRewards([recipient]));
    }

    if (hashs.length === 0) {
      logger.log("No rewards to claim");
      return;
    }

    const logs = await Promise.all(hashs.map(hash => getERC20Events(hash, client)));
    logs.flat().forEach((log) => {
      if (log.eventName === "Transfer") {
        const { from, to, value } = log.args;
        logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
      }
    });
  });

rewardsCmd
  .command("claim-operator-fee")
  .description("Claim operator fees in batch of 64 epochs")
  .addArgument(argRewardsAddress)
  .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
  .asyncAction({ signer: true }, async (client, rewardsAddress, options) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const recipient = options.recipient ?? client.addresses.C;

    let hashs: Hex[] = [];
    for (const _ of Array.from({ length: await getRewardsClaimsCount(rewardsContract, client, 'Operator', client.account!) })) {
      hashs.push(await rewardsContract.safeWrite.claimOperatorFee([recipient]));
    }

    if (hashs.length === 0) {
      logger.log("No operator fees to claim");
      return;
    }

    const logs = await Promise.all(hashs.map(hash => getERC20Events(hash, client)));
    logs.flat().forEach((log) => {
      if (log.eventName === "Transfer") {
        const { from, to, value } = log.args;
        logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
      }
    });
  });

rewardsCmd
  .command("claim-curator-fee")
  .description("Claim all curator fees in batch of 64 epochs")
  .addArgument(argRewardsAddress)
  .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
  .asyncAction({ signer: true }, async (client, rewardsAddress, options) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const recipient = options.recipient ?? client.addresses.C;

    let hashs: Hex[] = [];
    for (const _ of Array.from({ length: await getRewardsClaimsCount(rewardsContract, client, 'Curator', client.account!) })) {
      hashs.push(await rewardsContract.safeWrite.claimCuratorFee([recipient]));
    }

    if (hashs.length === 0) {
      logger.log("No curator fees to claim");
      return;
    }

    const logs = await Promise.all(hashs.map(hash => getERC20Events(hash, client)));
    logs.flat().forEach((log) => {
      if (log.eventName === "Transfer") {
        const { from, to, value } = log.args;
        logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
      }
    });
  });

rewardsCmd
  .command("claim-protocol-fee")
  .description("Claim protocol fees (only for protocol owner)")
  .addArgument(argRewardsAddress)
  .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
  .asyncAction({ signer: true }, async (client, rewardsAddress, options) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const recipient = options.recipient ?? client.addresses.C;
    const hash = await rewardsContract.safeWrite.claimProtocolFee([recipient]);

    if (!hash) {
      logger.log("No protocol fees to claim");
      return;
    }

    const logs = await getERC20Events(hash, client);
    logs.forEach((log) => {
      if (log.eventName === "Transfer") {
        const { from, to, value } = log.args;
        logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
      }
    });
  });

rewardsCmd
  .command("claim-undistributed")
  .description("Claim undistributed rewards (admin only)")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("epoch", "Epoch to claim undistributed rewards for"))
  .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
  .asyncAction({ signer: true }, async (client, rewardsAddress, epoch, options) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const recipient = options.recipient ?? client.addresses.C;
    const hash = await rewardsContract.safeWrite.claimUndistributedRewards([epoch, recipient]);

    if (!hash) {
      logger.log("No undistributed rewards to claim");
      return;
    }

    const logs = await getERC20Events(hash, client);
    logs.forEach((log) => {
      if (log.eventName === "Transfer") {
        const { from, to, value } = log.args;
        logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
      }
    });
  });

rewardsCmd
  .command("set-amount")
  .description("Set rewards amount for epochs")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("startEpoch", "Starting epoch"))
  .addArgument(ArgNumber("numberOfEpochs", "Number of epochs"))
  .argument("rewardsAmount", "Amount of rewards in decimal format")
  .asyncAction({ signer: true }, async (client, rewardsAddress, startEpoch, numberOfEpochs, rewardsAmount) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    if (rewardsContract.name !== 'RewardsNativeToken') {
      throw new Error('Rewards contract is not a RewardsNativeToken');
    }
    const tokenAddress = await (rewardsContract as SafeSuzakuContract['RewardsNativeToken']).read.rewardsToken() as Hex;
    const token = await getERC20(client, tokenAddress);
    const decimals = await token.read.decimals();
    const rewardsAmountWei = parseUnits(rewardsAmount, decimals);
    const amountToApprove = rewardsAmountWei * BigInt(numberOfEpochs);
    await token.safeWrite.approve([rewardsAddress, amountToApprove], {
      chain: null,
      account: client.account!,
    });
    const txHash = await rewardsContract.safeWrite.setRewardsAmountForEpochs([startEpoch, numberOfEpochs, rewardsAmountWei]);
    logger.log(`setRewardsAmountForEpochs tx hash: ${txHash}`);
  });

rewardsCmd
  .command("set-bips-collateral-class")
  .description("Set rewards bips for collateral class")
  .addArgument(argRewardsAddress)
  .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
  .addArgument(ArgNumber("bips", "Bips in basis points (100 = 1%)"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, collateralClass, bips) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const hash = await rewardsContract.safeWrite.setRewardsBipsForCollateralClass([collateralClass, bips]);
    logger.log(`setRewardsBipsForCollateralClass tx hash: ${hash}`);
  });

rewardsCmd
  .command("set-min-uptime")
  .description("Set minimum required uptime for rewards eligibility")
  .addArgument(argRewardsAddress)
  .addArgument(ArgBigInt("minUptime", "Minimum uptime in seconds"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, minUptime) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const hash = await rewardsContract.safeWrite.setMinRequiredUptime([minUptime]);
    logger.log(`setMinRequiredUptime tx hash: ${hash}`);
  });

rewardsCmd
  .command("set-protocol-owner")
  .description("Set protocol owner (DEFAULT_ADMIN_ROLE only)")
  .addArgument(argRewardsAddress)
  .addArgument(ArgAddress("newOwner", "New protocol owner address"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, newOwner) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const hash = await rewardsContract.safeWrite.setProtocolOwner([newOwner]);
    logger.log(`setProtocolOwner tx hash: ${hash}`);
  });

rewardsCmd
  .command("update-protocol-fee")
  .description("Update protocol fee")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, newFee) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const hash = await rewardsContract.safeWrite.updateProtocolFee([newFee]);
    logger.log(`updateProtocolFee tx hash: ${hash}`);
  });

rewardsCmd
  .command("update-operator-fee")
  .description("Update operator fee")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, newFee) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const hash = await rewardsContract.safeWrite.updateOperatorFee([newFee]);
    logger.log(`updateOperatorFee tx hash: ${hash}`);
  });

rewardsCmd
  .command("update-curator-fee")
  .description("Update curator fee")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, newFee) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const hash = await rewardsContract.safeWrite.updateCuratorFee([newFee]);
    logger.log(`updateCuratorFee tx hash: ${hash}`);
  });

rewardsCmd
  .command("update-all-fees")
  .description("Update all fees at once (protocol, operator, curator)")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("protocolFee", "New protocol fee in basis points (100 = 1%)"))
  .addArgument(ArgNumber("operatorFee", "New operator fee in basis points (100 = 1%)"))
  .addArgument(ArgNumber("curatorFee", "New curator fee in basis points (100 = 1%)"))
  .asyncAction({ signer: true }, async (client, rewardsAddress, protocolFee, operatorFee, curatorFee) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const hash = await rewardsContract.safeWrite.updateAllFees([protocolFee, operatorFee, curatorFee]);
    logger.log(`updateAllFees tx hash: ${hash}`);
  });

rewardsCmd
  .command("get-epoch-rewards")
  .description("Get rewards amount for a specific epoch")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("epoch", "Epoch to query"))
  .asyncAction(async (client, rewardsAddress, epoch) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const amount = await rewardsContract.read.getEpochRewards([epoch]) as bigint;
    logger.log(`Rewards amount at epoch ${epoch}: ${amount.toString()}`);
  });

rewardsCmd
  .command("get-operator-shares")
  .description("Get operator shares for a specific epoch")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("epoch", "Epoch to query"))
  .addArgument(argOperatorAddress)
  .asyncAction(async (client, rewardsAddress, epoch, operator) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const share = await rewardsContract.read.operatorShares([epoch, operator]) as bigint;
    logger.log(`Operator ${operator} shares for epoch ${epoch}: ${share.toString()}`);
  });

rewardsCmd
  .command("get-vault-shares")
  .description("Get vault shares for a specific epoch")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("epoch", "Epoch to query"))
  .addArgument(argVaultAddress)
  .asyncAction(async (client, rewardsAddress, epoch, vault) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const share = await rewardsContract.read.vaultShares([epoch, vault]) as bigint;
    logger.log(`Vault ${vault} shares for epoch ${epoch}: ${share.toString()}`);
  });

rewardsCmd
  .command("get-curator-shares")
  .description("Get curator shares for a specific epoch")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("epoch", "Epoch to query"))
  .addArgument(ArgAddress("curator", "Curator address"))
  .asyncAction(async (client, rewardsAddress, epoch, curator) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const share = await rewardsContract.read.curatorShares([epoch, curator]) as bigint;
    logger.log(`Curator ${curator} shares for epoch ${epoch}: ${share.toString()}`);
  });

rewardsCmd
  .command("get-protocol-rewards")
  .description("Get protocol rewards for a token")
  .addArgument(argRewardsAddress)
  .addArgument(ArgAddress("token", "Token address"))
  .asyncAction(async (client, rewardsAddress, token) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const rewardsAmount = await rewardsContract.read.protocolRewards();
    logger.log(`Protocol rewards: ${rewardsAmount.toString()}`);
  });

rewardsCmd
  .command("get-distribution-batch")
  .description("Get distribution batch status for an epoch")
  .addArgument(argRewardsAddress)
  .addArgument(ArgNumber("epoch", "Epoch to query"))
  .asyncAction(async (client, rewardsAddress, epoch) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const result = await rewardsContract.read.distributionBatches([epoch]) as [bigint, boolean];
    logger.log(`Distribution batch for epoch ${epoch}:`);
    logger.log(`  Last processed operator: ${result[0].toString()}`);
    logger.log(`  Is complete: ${result[1]}`);
  });

rewardsCmd
  .command("get-fees-client")
  .description("Get current fees clienturation")
  .addArgument(argRewardsAddress)
  .asyncAction(async (client, rewardsAddress) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const protocolFee = await rewardsContract.read.protocolFee();
    const operatorFee = await rewardsContract.read.operatorFee();
    const curatorFee = await rewardsContract.read.curatorFee();
    logger.log("Fees configuration:");
    logger.log(`  Protocol fee: ${protocolFee}`);
    logger.log(`  Operator fee: ${operatorFee}`);
    logger.log(`  Curator fee: ${curatorFee}`);
  });

rewardsCmd
  .command("get-bips-collateral-class")
  .description("Get rewards bips for collateral class")
  .addArgument(argRewardsAddress)
  .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
  .asyncAction(async (client, rewardsAddress, collateralClass) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const bips = await rewardsContract.read.rewardsBipsPerCollateralClass([collateralClass]);
    logger.log(`Rewards bips for collateral class ${collateralClass}: ${bips}`);
  });

rewardsCmd
  .command("get-min-uptime")
  .description("Get minimum required uptime for rewards eligibility")
  .addArgument(argRewardsAddress)
  .asyncAction(async (client, rewardsAddress) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const minUptime = await rewardsContract.read.minRequiredUptime();
    logger.log(`Minimum required uptime: ${minUptime.toString()}`);
  });

rewardsCmd
  .command("get-last-claimed-staker")
  .description("Get last claimed epoch for a staker")
  .addArgument(argRewardsAddress)
  .addArgument(ArgAddress("staker", "Staker address"))
  .addArgument(argRewardTokenAddress)
  .asyncAction(async (client, rewardsAddress, staker, rewardToken) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const lastEpoch = await rewardsContract.read.lastEpochClaimedStaker([staker]);
    logger.log(`Last epoch claimed by staker ${staker}: ${lastEpoch.toString()}`);
  });

rewardsCmd
  .command("get-last-claimed-operator")
  .description("Get last claimed epoch for an operator")
  .addArgument(argRewardsAddress)
  .addArgument(argOperatorAddress)
  .addArgument(argRewardTokenAddress)
  .asyncAction(async (client, rewardsAddress, operator, rewardToken) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const lastEpoch = await rewardsContract.read.lastEpochClaimedOperator([operator]);
    logger.log(`Last epoch claimed by operator ${operator}: ${lastEpoch.toString()}`);
  });

rewardsCmd
  .command("get-last-claimed-curator")
  .description("Get last claimed epoch for a curator")
  .addArgument(argRewardsAddress)
  .addArgument(ArgAddress("curator", "Curator address"))
  .addArgument(argRewardTokenAddress)
  .asyncAction(async (client, rewardsAddress, curator, rewardToken) => {
    const rewardsContract = await getRewardsNativeToken(client, rewardsAddress);
    const lastEpoch = await rewardsContract.read.lastEpochClaimedCurator([curator]);
    logger.log(`Last epoch claimed by curator ${curator}: ${lastEpoch.toString()}`);
  });
  return rewardsCmd;
}
