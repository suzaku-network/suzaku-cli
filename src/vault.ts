import { ExtendedPublicClient } from './client';
import { SuzakuContract } from './lib/viemUtils';
import { type Hex, parseUnits, formatUnits } from 'viem';
import { logger } from './lib/logger';
import { getVaultTokenized, getDefaultCollateral, getERC20, getL1RestakeDelegator } from '@suzaku-sdk/node';
import { ArgAddress, ArgBigInt, ParserAddress } from './lib/cliParser';
import { argValidatorManagerAddress, SuzakuCliProgram } from './cli';
import { Option } from '@commander-js/extra-typings'
import { argOperatorAddress } from './operator';

export const argVaultAddress = ArgAddress("vaultAddress", "Vault contract address");

type CollateralClassInfo = {
  class: number;
  l1Limit: number;
  totalOperatorShares: number;
};

type VaultInfo = {
  address: Hex;
  collateral: Hex;
  collateralLimit: number;
  collateralAsset: Hex;
  collateralAssetSymbol: string;
  decimals: number;
  delegator: Hex;
  slasher: Hex;
  totalStake: number;
  activeStake: number;
  epochDuration: number;
  currentEpoch: number;
  depositWhitelist: boolean;
  depositLimit?: number;
  collateralClasses?: CollateralClassInfo[];
};

export async function info(
  vault: SuzakuContract['VaultTokenized'],
  client: ExtendedPublicClient,
  middleware?: SuzakuContract['L1Middleware']
): Promise<VaultInfo> {
  const [
    collateralAddress,
    delegatorAddress,
    slasherAddress,
    totalStake,
    activeStake,
    epochDuration,
    currentEpoch,
    depositWhitelist,
    isDepositLimit,
  ] = await vault.multicall([
    'collateral',
    'delegator',
    'slasher',
    'totalStake',
    'activeStake',
    'epochDuration',
    'currentEpoch',
    'depositWhitelist',
    'isDepositLimit',
  ] as const);

  const [collateral, depositLimit] = await Promise.all([
    getDefaultCollateral(client, collateralAddress),
    isDepositLimit ? vault.read.depositLimit() : Promise.resolve(undefined),
  ]);

  const [collateralAsset, collateralLimit, decimals] = await collateral.multicall([
    'asset',
    'limit',
    'decimals',
  ]);

  const assetToken = await getERC20(client, collateralAsset);
  const collateralAssetSymbol = await assetToken.read.symbol();

  let collateralClasses: CollateralClassInfo[] | undefined;
  if (middleware) {
    const delegator = await getL1RestakeDelegator(client, delegatorAddress);
    const [[primary, secondaries], l1Address] = await middleware.multicall(['getActiveCollateralClasses', "BALANCER"]);
    const allClasses = [primary, ...secondaries];

    collateralClasses = await Promise.all(
      allClasses.map(async (cls): Promise<CollateralClassInfo> => {
        const [l1Limit, totalOperatorShares] = await Promise.all([
          delegator.read.l1Limit([l1Address, cls]),
          delegator.read.totalOperatorL1Shares([l1Address, cls]),
        ]);
        return { class: Number(cls), l1Limit: Number(l1Limit), totalOperatorShares: Number(totalOperatorShares) };
      })
    );
  }

  return {
    address: vault.address,
    collateral: collateralAddress as Hex,
    collateralLimit: Number(collateralLimit),
    collateralAsset: collateralAsset as Hex,
    collateralAssetSymbol,
    decimals,
    delegator: delegatorAddress as Hex,
    slasher: slasherAddress as Hex,
    totalStake: Number(totalStake),
    activeStake: Number(activeStake),
    epochDuration: Number(epochDuration),
    currentEpoch: Number(currentEpoch),
    depositWhitelist,
    ...(depositLimit !== undefined && { depositLimit: Number(depositLimit) }),
    ...(collateralClasses && { collateralClasses }),
  };
}


/* --------------------------------------------------
* VAULT DEPOSIT/WITHDRAW/CLAIM/GRANT
* -------------------------------------------------- */
export function addVaultCommands(program: SuzakuCliProgram) {
const vaultCmd = program
    .command("vault")
    .description("Commands to interact with a Vault and L1 Re-stake Delegator contracts");

vaultCmd
    .command("deposit")
    .description("Deposit tokens into the vault")
    .addArgument(argVaultAddress)
    .argument("amount", "Amount of token to deposit in the vault")
    .addOption(new Option("--onBehalfOf <behalfOf>", "Optional onBehalfOf address").argParser(ParserAddress))
    .asyncAction({ signer: true }, async (client, vaultAddress, amount, options) => {
        const onBehalfOf = options.onBehalfOf ?? client.addresses.C;
      logger.log("Depositing...");

      const vault = await getVaultTokenized(client, vaultAddress);
      const collateralAddress = await vault.read.collateral();
      const collateral = await getDefaultCollateral(client, collateralAddress);
      const decimals = await collateral.read.decimals();
      const amountWei = parseUnits(amount, decimals)
      logger.log("\n=== Deposit Details ===");
      logger.log("Amount:", amount, "tokens");
      logger.log("Amount in wei:", amountWei.toString());
      logger.log("Decimals used:", decimals);

      logger.log("Collateral address:", collateralAddress);
      logger.log("Vault address:", vault.address);

      logger.log("\n=== Collateral Approval ===");
      logger.log("Approving:", amount, "tokens");
      logger.log("Approval amount in wei:", amountWei.toString());
      logger.log("Spender (vault):", vault.address);
      const approveTx = await collateral.safeWrite.approve([vault.address, amountWei]);
      logger.log("Approval tx hash:", approveTx);

      logger.log("Waiting for approval confirmation...");
      const approvalReceipt = await client.waitForTransactionReceipt({ hash: approveTx });
      logger.log("Approval confirmed in block:", approvalReceipt.blockNumber);

      logger.log("\n=== Executing Deposit ===");
      logger.log("Depositing:", amount, "tokens");
      logger.log("Deposit amount in wei:", amountWei.toString());
      logger.log("On behalf of:", onBehalfOf);
      const hash = await vault.safeWrite.deposit([onBehalfOf, amountWei]);
      logger.log("Deposit tx hash:", hash);

      logger.log("Waiting for deposit confirmation...");
      const depositReceipt = await client.waitForTransactionReceipt({ hash: hash });
      logger.log("Deposit confirmed in block:", depositReceipt.blockNumber);
      logger.log("Deposit completed successfully!");
    });

vaultCmd
    .command("withdraw")
    .description("Withdraw tokens from the vault")
    .addArgument(argVaultAddress)
    .argument("amount", "Amount of token to withdraw in the vault")
    .addOption(new Option("--claimer <claimer>", "Optional claimer").argParser(ParserAddress))
    .asyncAction({ signer: true }, async (client, vaultAddress, amount, options) => {
        const claimer = options.claimer ?? client.addresses.C;
        const vault = await getVaultTokenized(client, vaultAddress);
        const amountWei = parseUnits(amount, await vault.read.decimals())
        logger.log("Withdrawing...");
        const hash = await vault.safeWrite.withdraw([claimer, amountWei]);
        logger.log("Withdraw done, tx hash:", hash);
        logger.log("Withdrawal completed successfully!");
    });

vaultCmd
    .command("claim")
    .description("Claim withdrawn tokens from the vault for a specific epoch")
    .addArgument(argVaultAddress)
    .addArgument(ArgBigInt("epoch", "Epoch number"))
    .addOption(new Option("--recipient <recipient>", "Optional recipient").argParser(ParserAddress))
    .asyncAction({ signer: true }, async (client, vaultAddress, epoch, options) => {
        const recipient = options.recipient ?? client.addresses.C;
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log("Claiming...");
        const hash = await vault.safeWrite.claim([recipient, epoch]);
        logger.log("Claim done, tx hash:", hash);
        logger.log("Claim completed successfully!");
    });

vaultCmd
    .command("grant-staker-role")
    .description("Grant staker role on a vault to an account")
    .addArgument(argVaultAddress)
    .addArgument(ArgAddress("account", "Account to grant the role to"))
    .asyncAction({ signer: true }, async (client, vaultAddress, account) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        await vault.safeWrite.grantRole([await vault.read.DEPOSITOR_WHITELIST_ROLE(), account],
            {
                chain: null,
                account: client.account!,
            })
        logger.log(`Granted staker role to ${account} on vault (${await vault.read.name()}) ${vaultAddress}`);
    });

vaultCmd
    .command("revoke-staker-role")
    .description("Revoke staker role on a vault from an account")
    .addArgument(argVaultAddress)
    .addArgument(ArgAddress("account", "Account to revoke the role from"))
    .asyncAction({ signer: true }, async (client, vaultAddress, account) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        await vault.safeWrite.revokeRole([await vault.read.DEPOSITOR_WHITELIST_ROLE(), account],
            {
                chain: null,
                account: client.account!,
            })
        logger.log(`Revoked staker role from ${account} on vault (${await vault.read.name()}) ${vaultAddress}`);
    });

vaultCmd
    .command("collateral-deposit")
    .description("Approve and deposit tokens into the collateral contract associated with a vault")
    .addArgument(ArgAddress("collateralAddress", "Collateral contract address"))
    .argument("amount", "Amount of token to deposit in the collateral")
    .asyncAction({ signer: true }, async (client, collateralAddress, amount) => {
        logger.log("Approving collateral...");
        const collateral = await getDefaultCollateral(client, collateralAddress);
        const rewardTokenAddress = await collateral.read.asset();
        const rewardToken = await getERC20(client, rewardTokenAddress);
        const decimals = await collateral.read.decimals();
        const amountWei = parseUnits(amount, decimals)
        const hash = await rewardToken.safeWrite.approve([collateralAddress, amountWei]);
        await client.waitForTransactionReceipt({ hash })
        logger.log("Approval done, tx hash:", hash);
        const depositTx = await collateral.safeWrite.deposit([client.addresses.C, amountWei]);
        await client.waitForTransactionReceipt({ hash: depositTx })
        logger.log("Deposit to collateral done, tx hash:", depositTx);
    });

vaultCmd
    .command("set-deposit-limit")
    .description("Set deposit limit for a vault (0 will disable the limit)")
    .addArgument(argVaultAddress)
    .argument("limit", "Deposit limit amount")
    .asyncAction({ signer: true }, async (client, vaultAddress, limit) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const limitWei = parseUnits(limit, await vault.read.decimals())
        const isLimitShouldBeEnabled = limitWei > 0n;
        const isLimitEnabled = await vault.read.isDepositLimit();
        if (isLimitShouldBeEnabled !== isLimitEnabled) {
            await vault.safeWrite.setIsDepositLimit([isLimitShouldBeEnabled],
                {
                    chain: null,
                    account: client.account!,
                })
            logger.log(`Set deposit limit enabled to ${isLimitShouldBeEnabled} for vault (${await vault.read.name()}) ${vaultAddress}`);
        }
        await vault.safeWrite.setDepositLimit([limitWei],
            {
                chain: null,
                account: client.account!,
            })
        logger.log(`Set deposit limit to ${limit} for vault (${await vault.read.name()}) ${vaultAddress}`);
    });

vaultCmd
    .command("collateral-increase-limit")
    .description("Set deposit limit for a collateral")
    .addArgument(argVaultAddress)
    .argument("limit", "Deposit limit amount")
    .asyncAction({ signer: true }, async (client, vaultAddress, limit) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const collateralAddress = await vault.read.collateral();
        const collateral = await getDefaultCollateral(client, collateralAddress);
        const limitWei = parseUnits(limit, await collateral.read.decimals())
        await collateral.safeWrite.increaseLimit([limitWei],
            {
                chain: null,
                account: client.account!,
            })
        logger.log(`Collateral (${collateralAddress}) limit increased to ${limit} (${await collateral.read.name()})`);
    });

/* --------------------------------------------------
* VAULT READ COMMANDS
* -------------------------------------------------- */
vaultCmd
    .command("get-collateral")
    .description("Get the collateral token address of a vault")
    .addArgument(argVaultAddress)
    .asyncAction(async (client, vaultAddress) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log("Reading vault collateral...");
        const collateral = await vault.read.collateral();
        logger.log("Collateral token:", collateral);
    });

vaultCmd
    .command("get-delegator")
    .description("Get the delegator address of a vault")
    .addArgument(argVaultAddress)
    .asyncAction(async (client, vaultAddress) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const delegator = await vault.read.delegator();
        logger.log("Vault delegator:", delegator);
    });

vaultCmd
    .command("get-balance")
    .description("Get vault token balance for an account")
    .addArgument(argVaultAddress)
    .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
    .asyncAction({ signer: true }, async (client, vaultAddress, options) => {
        const account = options.account ?? client.addresses.C;
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log(`Reading vault balance for ${account}...`);
        const balance = await vault.read.balanceOf([account]);
        logger.log("Vault token balance:", balance.toString());
    });

vaultCmd
    .command("get-active-balance")
    .description("Get active vault balance for an account")
    .addArgument(argVaultAddress)
    .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
    .asyncAction({ signer: true }, async (client, vaultAddress, options) => {
        const account = options.account ?? client.addresses.C;
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log(`Reading active vault balance for ${account}...`);
        const activeBalance = await vault.read.activeBalanceOf([account]);
        logger.log("Active vault balance:", activeBalance.toString());
    });

vaultCmd
    .command("get-total-supply")
    .description("Get total supply of vault tokens")
    .addArgument(argVaultAddress)
    .asyncAction(async (client, vaultAddress) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log("Reading vault total supply...");
        const totalSupply = await vault.read.totalSupply();
        logger.log("Total supply:", totalSupply.toString());
    });

vaultCmd
    .command("get-withdrawal-shares")
    .description("Get withdrawal shares for an account at a specific epoch")
    .addArgument(argVaultAddress)
    .addArgument(ArgBigInt("epoch", "Epoch number"))
    .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
    .asyncAction({ signer: true }, async (client, vaultAddress, epoch, options) => {
        const account = options.account ?? client.addresses.C;
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log(`Reading withdrawal shares for ${account} at epoch ${epoch}...`);
        const shares = await vault.read.withdrawalSharesOf([epoch, account]);
        logger.log("Withdrawal shares:", shares.toString());
    });

vaultCmd
    .command("get-withdrawals")
    .description("Get withdrawal amount for an account at a specific epoch")
    .addArgument(argVaultAddress)
    .addArgument(ArgBigInt("epoch", "Epoch number"))
    .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
    .asyncAction({ signer: true }, async (client, vaultAddress, epoch, options) => {
        const account = options.account ?? client.addresses.C;
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log(`Reading withdrawals for ${account} at epoch ${epoch}...`);
        const withdrawalAmount = await vault.read.withdrawalsOf([epoch, account]);
        logger.log("Withdrawal amount:", withdrawalAmount.toString());
    });

vaultCmd
    .command("get-deposit-limit")
    .description("Get deposit limit for a vault")
    .addArgument(argVaultAddress)
    .asyncAction(async (client, vaultAddress) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const limit = await vault.read.depositLimit();
        const isLimitEnabled = await vault.read.isDepositLimit();
        logger.log(`Deposit limit for vault ${vaultAddress}: ${formatUnits(limit, await vault.read.decimals())} (enabled: ${isLimitEnabled})`);
    });

/* --------------------------------------------------
* L1RestakeDelegator (set-l1-limit / set-operator-l1-shares)
* -------------------------------------------------- */
vaultCmd
    .command("set-l1-limit")
    .description("Set the L1 limit for a vault's delegator")
    .addArgument(argVaultAddress)
    .addArgument(argValidatorManagerAddress)
    .argument("limit", "Limit amount")
    .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
    .asyncAction({ signer: true }, async (client, vaultAddress, l1Address, limit, collateralClass) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const delegatorAddress = await vault.read.delegator();
        const delegator = await getL1RestakeDelegator(client, delegatorAddress);
        const limitWei = parseUnits(limit, await vault.read.decimals())
        logger.log("Setting L1 limit...");
        const hash = await delegator.safeWrite.setL1Limit([l1Address, collateralClass, limitWei]);
        logger.log("setL1Limit done, tx hash:", hash);
    });

vaultCmd
    .command("set-operator-l1-shares")
    .description("Set the L1 shares for an operator in a delegator")
    .addArgument(argVaultAddress)
    .addArgument(argValidatorManagerAddress)
    .addArgument(argOperatorAddress)
    .addArgument(ArgBigInt("shares", "Shares amount"))
    .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
    .asyncAction({ signer: true }, async (client, vaultAddress, l1Address, operatorAddress, shares, collateralClass) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const delegatorAddress = await vault.read.delegator();
        const delegator = await getL1RestakeDelegator(client, delegatorAddress);
        logger.log("Setting operator L1 shares...");
        const hash = await delegator.safeWrite.setOperatorL1Shares([l1Address, collateralClass, operatorAddress, shares]);
        logger.log("setOperatorL1Shares done, tx hash:", hash);
    });

vaultCmd
    .command("get-l1-limit")
    .description("Get L1 limit for a vault's delegator")
    .addArgument(argVaultAddress)
    .addArgument(argValidatorManagerAddress)
    .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
    .asyncAction(async (client, vaultAddress, l1Address, collateralClass) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const delegatorAddress = await vault.read.delegator();
        const delegator = await getL1RestakeDelegator(client, delegatorAddress);
        const limit = await delegator.read.l1Limit([l1Address, collateralClass]);
        logger.log(`L1 limit for vault ${vaultAddress} on L1 ${l1Address} (collateral class ${collateralClass}): ${formatUnits(limit, await vault.read.decimals())}`);
    });

vaultCmd
    .command("get-operator-l1-shares")
    .description("Get L1 shares for an operator in a vault's delegator")
    .addArgument(argVaultAddress)
    .addArgument(argValidatorManagerAddress)
    .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
    .addArgument(argOperatorAddress)
    .asyncAction(async (client, vaultAddress, l1Address, collateralClass, operatorAddress) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const delegatorAddress = await vault.read.delegator();
        const delegator = await getL1RestakeDelegator(client, delegatorAddress);
        const shares = await delegator.read.operatorL1Shares([l1Address, collateralClass, operatorAddress]);
        logger.log(`L1 shares for operator ${operatorAddress} in vault ${vaultAddress} on L1 ${l1Address} (collateral class ${collateralClass}): ${shares}`);
    });

    return vaultCmd;
}
