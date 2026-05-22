/**
 * --------------------------------------------------
 * Validator Manager
 * --------------------------------------------------
 */
import { SuzakuCliProgram, argValidatorManagerAddress } from "./cli";
import { logger } from "./lib/logger";
import { ArgAddress, ArgHex } from "./lib/cliParser";
import { getValidatorManager } from "@suzaku-network/suzaku-sdk/core";

export function addValidatorManagerCommands(program: SuzakuCliProgram) {
  const validatorManagerCmd = program
    .command("vmc")
    .description("Commands to interact with ValidatorManager contracts");

  validatorManagerCmd
    .command("info")
    .description("Get summary informations of a ValidatorManager contract")
    .addArgument(argValidatorManagerAddress)
    .asyncAction(async (client, validatorManagerAddress) => {
      // instantiate ValidatorManager contract
      const validatorManager = await getValidatorManager(client, validatorManagerAddress);

      const names = ['getChurnTracker', 'getChurnPeriodSeconds', 'l1TotalWeight', 'owner', 'subnetID'] as const;
      const values = await validatorManager.multicall(names);
      const results = names.reduce((acc, name, i) => ({ ...acc, [name]: values[i] }), {} as Record<string, unknown>);

      logger.log(results);
    });

  validatorManagerCmd
    .command("transfer-ownership")
    .description("Transfer the ownership of a ValidatorManager contract")
    .addArgument(argValidatorManagerAddress)
    .addArgument(ArgAddress("owner", "Owner address"))
    .asyncAction({ signer: true }, async (client, validatorManagerAddress, owner) => {
      // instantiate ValidatorManager contract
      const validatorManager = await getValidatorManager(client, validatorManagerAddress);
      await validatorManager.safeWrite.transferOwnership([owner]);
    });

  validatorManagerCmd
    .command("complete-validator-removal")
    .description("Complete the removal of a validator that has been pending removal")
    .addArgument(argValidatorManagerAddress)
    .addArgument(ArgHex("removalTxId", "Removal transaction ID"))
    .asyncAction({ signer: true }, async (client, validatorManagerAddress, removalTxId) => {
      // instantiate ValidatorManager contract
      const validatorManager = await getValidatorManager(client, validatorManagerAddress);
      logger.error("Not implemented yet");
    });

  validatorManagerCmd
    .command("info-validator")
    .description("List all validators in the ValidatorManager contract")
    .addArgument(argValidatorManagerAddress)
    .addArgument(ArgHex("validationId", "Validator validation ID"))
    .asyncAction({ signer: true }, async (client, validatorManagerAddress, validationId) => {
      // instantiate ValidatorManager contract
      const validatorManager = await getValidatorManager(client, validatorManagerAddress);
      const validators = await validatorManager.read.getValidator([validationId])
      logger.log(validators);
    });
  return validatorManagerCmd;
}
