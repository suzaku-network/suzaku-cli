import { Hex } from 'viem';
import { SuzakuContract, SafeSuzakuContract } from './lib/viemUtils';
import { logger } from './lib/logger';

export async function lstWrapperInfo(
  lstWrapper: SuzakuContract['LSTWrapper']
) {
  logger.log("Fetching LSTWrapper information...");

  const [
    name,
    symbol,
    decimals,
    vault,
    collateral,
    nativeToken,
    rewards,
    totalAssets,
    totalSupply,
    paused,
    owner,
  ] = await lstWrapper.multicall([
    'name',
    'symbol',
    'decimals',
    'vault',
    'collateral',
    'nativeToken',
    'rewards',
    'totalAssets',
    'totalSupply',
    'paused',
    'owner',
  ] as const);

  const info = {
    address: lstWrapper.address,
    name,
    symbol,
    decimals,
    vault: vault as Hex,
    collateral: collateral as Hex,
    nativeToken: nativeToken as Hex,
    rewards: rewards as Hex,
    totalAssets: totalAssets.toString(),
    totalSupply: totalSupply.toString(),
    paused,
    owner: owner as Hex,
  };

  logger.logJsonTree(info);
  logger.addData('lstWrapperInfo', info);
  return info;
}

export async function lstWrapperGetBalance(
  lstWrapper: SuzakuContract['LSTWrapper'],
  account: Hex
) {
  logger.log(`Reading balance for ${account}...`);
  logger.log("  → LST shares held; determines redemption value and voting weight");

  const balance = await lstWrapper.read.balanceOf([account]);
  logger.log("Balance:", balance.toString());
  return balance;
}

export async function lstWrapperGetAllowance(
  lstWrapper: SuzakuContract['LSTWrapper'],
  owner: Hex,
  spender: Hex
) {
  logger.log(`Reading allowance for spender ${spender} on behalf of ${owner}...`);
  logger.log("  → Amount spender can transfer from owner; must be >= amount before any vault deposit or helper stake");

  const allowance = await lstWrapper.read.allowance([owner, spender]);
  logger.log("Allowance:", allowance.toString());
  return allowance;
}

export async function lstWrapperGetCheckpoints(
  lstWrapper: SuzakuContract['LSTWrapper'],
  account: Hex,
  pos: number
) {
  logger.log(`Reading checkpoint at position ${pos} for ${account}...`);
  logger.log("  → Snapshot of voting power at a past block; used for governance proposals that require historical balance proofs");

  const checkpoint = await lstWrapper.read.checkpoints([account, pos]);
  logger.log("Checkpoint key (block):", checkpoint._key.toString());
  logger.log("Checkpoint value (votes):", checkpoint._value.toString());
  return checkpoint;
}

export async function lstWrapperPreviewDeposit(
  lstWrapper: SuzakuContract['LSTWrapper'],
  assets: bigint
) {
  logger.log(`Previewing deposit of ${assets} assets...`);
  logger.log("  → Shares you would receive; compare across time to detect exchange rate drift before committing");

  const shares = await lstWrapper.read.previewDeposit([assets]);
  logger.log("Shares to receive:", shares.toString());
  return shares;
}

export async function lstWrapperPreviewMint(
  lstWrapper: SuzakuContract['LSTWrapper'],
  shares: bigint
) {
  logger.log(`Previewing mint of ${shares} shares...`);
  logger.log("  → Assets required to obtain an exact share count; useful when targeting a specific governance weight");

  const assets = await lstWrapper.read.previewMint([shares]);
  logger.log("Assets required:", assets.toString());
  return assets;
}

export async function lstWrapperPreviewRedeem(
  lstWrapper: SuzakuContract['LSTWrapper'],
  shares: bigint
) {
  logger.log(`Previewing redeem of ${shares} shares...`);
  logger.log("  → Assets you would receive; reflects current exchange rate including accrued rewards");

  const assets = await lstWrapper.read.previewRedeem([shares]);
  logger.log("Assets to receive:", assets.toString());
  return assets;
}

export async function lstWrapperPreviewWithdraw(
  lstWrapper: SuzakuContract['LSTWrapper'],
  assets: bigint
) {
  logger.log(`Previewing withdrawal of ${assets} assets...`);
  logger.log("  → Shares to burn for an exact asset amount; higher value means the exchange rate worsened since deposit");

  const shares = await lstWrapper.read.previewWithdraw([assets]);
  logger.log("Shares to burn:", shares.toString());
  return shares;
}

export async function lstWrapperPaused(
  lstWrapper: SuzakuContract['LSTWrapper']
) {
  logger.log("Reading deposits paused state...");
  logger.log("  → When true, new deposits are blocked; existing positions are unaffected and can still be redeemed");

  const paused = await lstWrapper.read.paused();
  logger.log("Paused:", paused);
  return paused;
}

export async function lstWrapperConvertToAssets(
  lstWrapper: SuzakuContract['LSTWrapper'],
  shares: bigint
) {
  logger.log(`Converting ${shares} shares to assets...`);

  const assets = await lstWrapper.read.convertToAssets([shares]);
  logger.log("Assets:", assets.toString());
  return assets;
}

export async function lstWrapperConvertToShares(
  lstWrapper: SuzakuContract['LSTWrapper'],
  assets: bigint
) {
  logger.log(`Converting ${assets} assets to shares...`);

  const shares = await lstWrapper.read.convertToShares([assets]);
  logger.log("Shares:", shares.toString());
  return shares;
}

export async function lstWrapperGetVotes(
  lstWrapper: SuzakuContract['LSTWrapper'],
  account: Hex
) {
  logger.log(`Reading voting power for ${account}...`);
  logger.log("  → Current delegated votes; requires self-delegation first (delegate to self) to activate");

  const votes = await lstWrapper.read.getVotes([account]);
  logger.log("Votes:", votes.toString());
  return votes;
}

export async function lstWrapperMaxDeposit(
  lstWrapper: SuzakuContract['LSTWrapper'],
  account: Hex
) {
  logger.log(`Reading max deposit for ${account}...`);
  logger.log("  → Hard cap remaining before vault collateral limit is hit; 0 when deposits are paused or during seed phase");

  const max = await lstWrapper.read.maxDeposit([account]);
  logger.log("Max deposit:", max.toString());
  return max;
}

export async function lstWrapperDeposit(
  lstWrapper: SafeSuzakuContract['LSTWrapper'],
  assets: bigint,
  receiver: Hex
) {
  logger.log("Depositing assets into LSTWrapper...");
  logger.log("  → Mints LST shares proportional to deposited collateral; increases receiver's voting weight and reward exposure");

  const hash = await lstWrapper.safeWrite.deposit([assets, receiver]);
  logger.log("deposit done, tx hash:", hash);
  return hash;
}

export async function lstWrapperRedeem(
  lstWrapper: SafeSuzakuContract['LSTWrapper'],
  shares: bigint,
  receiver: Hex,
  owner: Hex
) {
  logger.log("Redeeming LST shares...");
  logger.log("  → Burns shares and returns underlying collateral assets; reduces owner's voting weight and reward exposure");

  const hash = await lstWrapper.safeWrite.redeem([shares, receiver, owner]);
  logger.log("redeem done, tx hash:", hash);
  return hash;
}

export async function lstWrapperHarvest(
  lstWrapper: SafeSuzakuContract['LSTWrapper']
) {
  logger.log("Harvesting rewards...");
  logger.log("  → Claims accrued native staking rewards from the collateral contract and re-stakes them as vault shares, compounding the exchange rate for all holders");

  const hash = await lstWrapper.safeWrite.harvest([0n, []]);
  logger.log("harvest done, tx hash:", hash);
  return hash;
}

export async function lstWrapperSetDepositsPaused(
  lstWrapper: SafeSuzakuContract['LSTWrapper'],
  paused: boolean
) {
  logger.log(`${paused ? 'Pausing' : 'Unpausing'} deposits...`);
  logger.log(`  → ${paused ? 'Blocks new deposits; existing positions remain claimable' : 'Re-opens deposits; collateral limit still applies'}`);

  const hash = await lstWrapper.safeWrite.setDepositsPaused([paused]);
  logger.log("setDepositsPaused done, tx hash:", hash);
  return hash;
}

export async function lstWrapperSweep(
  lstWrapper: SafeSuzakuContract['LSTWrapper'],
  token: Hex,
  recipient: Hex,
  amount: bigint
) {
  logger.log(`Sweeping token ${token} to ${recipient}...`);
  logger.log("  → Recovers ERC20 tokens accidentally sent to the contract; cannot sweep vault collateral or native token (reverts)");

  const hash = await lstWrapper.safeWrite.sweep([token, recipient, amount]);
  logger.log("sweep done, tx hash:", hash);
  return hash;
}

export async function lstWrapperSweepCollateralDust(
  lstWrapper: SafeSuzakuContract['LSTWrapper'],
  recipient: Hex,
  amount: bigint
) {
  logger.log(`Sweeping collateral dust to ${recipient}...`);
  logger.log("  → Removes sub-threshold collateral leftovers (rounding residue) without disrupting the vault share price");

  const hash = await lstWrapper.safeWrite.sweepCollateralDust([recipient, amount]);
  logger.log("sweepCollateralDust done, tx hash:", hash);
  return hash;
}
