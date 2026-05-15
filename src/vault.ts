import { parseUnits, formatUnits } from 'viem';
import { logger } from './lib/logger';
import { getVaultTokenized, getDefaultCollateral, getL1RestakeDelegator, getVaultInfo, deposit, setDepositLimit, increaseCollateralLimit, depositToCollateral, setL1Limit } from '@suzaku-sdk/core';
import { ArgAddress, ArgBigInt, ParserAddress } from './lib/cliParser';
import { argValidatorManagerAddress, SuzakuCliProgram } from './cli';
import { Option } from '@commander-js/extra-typings'
import { argOperatorAddress } from './operator';

export const argVaultAddress = ArgAddress("vaultAddress", "Vault contract address");

export { getVaultInfo };
export type { VaultInfo, CollateralClassInfo } from '@suzaku-sdk/core';

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
        const vault = await getVaultTokenized(client, vaultAddress);
        logger.log("Depositing...");
        const { approveTxHash, depositTxHash } = await deposit(client, vault, onBehalfOf, amount);
        logger.log("Approval tx hash:", approveTxHash);
        logger.log("Deposit completed, tx hash:", depositTxHash);
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
        const collateral = await getDefaultCollateral(client, collateralAddress);
        logger.log("Depositing to collateral...");
        const { approveTxHash, depositTxHash } = await depositToCollateral(client, collateral, client.addresses.C, amount);
        logger.log("Approval tx hash:", approveTxHash);
        logger.log("Deposit to collateral done, tx hash:", depositTxHash);
    });

vaultCmd
    .command("set-deposit-limit")
    .description("Set deposit limit for a vault (0 will disable the limit)")
    .addArgument(argVaultAddress)
    .argument("limit", "Deposit limit amount")
    .asyncAction({ signer: true }, async (client, vaultAddress, limit) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const hash = await setDepositLimit(client, vault, limit);
        logger.log(`Set deposit limit to ${limit}, tx hash: ${hash}`);
    });

vaultCmd
    .command("collateral-increase-limit")
    .description("Set deposit limit for a collateral")
    .addArgument(argVaultAddress)
    .argument("limit", "Deposit limit amount")
    .asyncAction({ signer: true }, async (client, vaultAddress, limit) => {
        const vault = await getVaultTokenized(client, vaultAddress);
        const hash = await increaseCollateralLimit(client, vault, limit);
        logger.log(`Collateral limit increased to ${limit}, tx hash: ${hash}`);
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
        logger.log("Setting L1 limit...");
        const hash = await setL1Limit(client, vault, l1Address, collateralClass, limit);
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
