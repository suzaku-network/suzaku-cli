import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { Hex } from 'viem';
import { logger } from './lib/logger';
import { argValidatorManagerAddress, SuzakuCliProgram } from './cli';
import { getOperatorL1OptInService, getOperatorVaultOptInService } from '@suzaku-sdk/core';
import { argOperatorAddress } from './operator';
import { argVaultAddress } from './vault';

export function addOperatorOptInCommands(program: SuzakuCliProgram) {
const operatorOptInCmd = program
    .command("opt-in")
    .description("Commands for operator opt-in services");

  /**
 * --------------------------------------------------
 * OPERATOR → L1: optIn / optOut / check
 * --------------------------------------------------
 */
operatorOptInCmd
    .command("l1-in")
    .description("Operator opts in to a given L1")
    .addArgument(argValidatorManagerAddress)
    .asyncAction({ signer: true }, async (client, l1Address) => {
        const service = await getOperatorL1OptInService(client);
      logger.log("Opting in to L1...");
      const hash = await service.safeWrite.optIn([l1Address]);
      logger.log("L1 opt-in successful, tx hash:", hash);
    });

operatorOptInCmd
    .command("l1-out")
    .description("Operator opts out from a given L1")
    .addArgument(argValidatorManagerAddress)
    .asyncAction({ signer: true }, async (client, l1Address) => {
        const service = await getOperatorL1OptInService(client);
      const hash = await service.safeWrite.optOut([l1Address]);
      logger.log("L1 opt-out successful, tx hash:", hash);
    });

operatorOptInCmd
    .command("check-l1")
    .description("Check if an operator is opted in to a given L1")
    .addArgument(argOperatorAddress)
    .addArgument(argValidatorManagerAddress)
    .asyncAction(async (client, operator, l1Address) => {
        const service = await getOperatorL1OptInService(client);
      const result = await service.read.isOptedIn(
        [operator, l1Address]
      );
      logger.log(`Operator ${operator} opt-in status for L1 ${l1Address}: ${result}`);
    });

  /**
   * --------------------------------------------------
   * OPERATOR → Vault: optIn / optOut / check
   * --------------------------------------------------
   */
  operatorOptInCmd
      .command("vault-in")
      .description("Operator opts in to a given Vault")
      .addArgument(argVaultAddress)
      .asyncAction({ signer: true }, async (client, vaultAddress) => {
          const service = await getOperatorVaultOptInService(client);
        const hash = await service.safeWrite.optIn([vaultAddress]);
        logger.log("Vault opt-in successful, tx hash:", hash);
      });
  
  operatorOptInCmd
      .command("vault-out")
      .description("Operator opts out from a given Vault")
      .addArgument(argVaultAddress)
      .asyncAction({ signer: true }, async (client, vaultAddress) => {
          const service = await getOperatorVaultOptInService(client);
        const hash = await service.safeWrite.optOut([vaultAddress]);
        logger.log("Vault opt-out successful, tx hash:", hash);
      });
  
  operatorOptInCmd
      .command("check-vault")
      .description("Check if an operator is opted in to a given Vault")
      .addArgument(argOperatorAddress)
      .addArgument(argVaultAddress)
      .asyncAction(async (client, operator, vaultAddress) => {
          const service = await getOperatorVaultOptInService(client);
        const result = await service.read.isOptedIn(
          [operator, vaultAddress]
        );
        logger.log(`Operator ${operator} opt-in status for vault ${vaultAddress}: ${result}`);
      });

  return operatorOptInCmd;
}
