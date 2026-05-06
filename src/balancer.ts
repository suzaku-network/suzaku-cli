import { logger } from './lib/logger';
import { ArgAddress, ArgBigInt, ArgNodeID } from './lib/cliParser';
import { Command } from '@commander-js/extra-typings';
import { getAccessControl, getBalancerValidatorManager, getOwnable, parseNodeID, ValidatorStatus, ValidatorStatusNames } from '@suzaku-sdk/core';


const argMiddlewareAddress = ArgAddress("middlewareAddress", "Middleware contract address");
export const argBalancerAddress = ArgAddress("balancerAddress", "Balancer validator manager contract address");

export default function addBalancerCommands(program: Command) {
  const balancerCmd = program
    .command("balancer")
    .description("Commands to interact with BalancerValidatorManager contracts");

  balancerCmd
    .command("set-up-security-module")
    .description("Set up a security module")
    .addArgument(argBalancerAddress)
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgBigInt("maxWeight", "Maximum weight"))
    .asyncAction({ signer: true }, async (config, balancerValidatorManagerAddress, middlewareAddress, maxWeight) => {
      // instantiate BalancerValidatorManager contract
      const balancer = await getBalancerValidatorManager(config, balancerValidatorManagerAddress);
      const hash = await balancer.safeWrite.setUpSecurityModule([middlewareAddress, maxWeight]);
      logger.log("Security module updated, tx hash:", hash);
    });

  balancerCmd
    .command("get-security-modules")
    .description("Get all security modules")
    .addArgument(argBalancerAddress)
    .asyncAction(async (config, balancerValidatorManagerAddress) => {
      const balancer = await getBalancerValidatorManager(config, balancerValidatorManagerAddress);
      const modules = await balancer.read.getSecurityModules();
      logger.log("Security modules:", modules);
      logger.addData("modules", modules);
    });

  balancerCmd
    .command("get-security-module-weights")
    .description("Get security module weights")
    .addArgument(argBalancerAddress)
    .addArgument(ArgAddress("securityModule", "Security module address"))
    .asyncAction(async (config, balancerValidatorManagerAddress, securityModule) => {
      const balancer = await getBalancerValidatorManager(config, balancerValidatorManagerAddress);
      const val = await balancer.read.getSecurityModuleWeights([securityModule]);
      logger.log("Security module weights:", val);
      logger.addData("weights", val);
    });

  balancerCmd
    .command("get-validator-status")
    .description("Get validator status by node ID")
    .addArgument(argBalancerAddress)
    .addArgument(ArgNodeID("nodeId", "Node ID"))
    .asyncAction(async (config, balancerAddress, nodeId) => {
      const balancer = await getBalancerValidatorManager(config, balancerAddress);
      const validationId = await balancer.read.getNodeValidationID([parseNodeID(nodeId, false)]);
      if (Number(validationId) === 0) {
        logger.log("Validator status: NotRegistered");
        return;
      }
      const [validator, PendingWeightUpdate] = await Promise.all([balancer.read.getValidator([validationId]), balancer.read.isValidatorPendingWeightUpdate([validationId])]);

      const status = validator.status == ValidatorStatus.Active && PendingWeightUpdate ? ValidatorStatus.PendingStakeUpdated : validator.status;
      logger.log("Validator status:", ValidatorStatusNames[status]);
      logger.addData("status", ValidatorStatusNames[status]);
      logger.addData("statusId", status);
      logger.addData("validationId", validationId);
      logger.addData("nodeId", nodeId);
    });

  balancerCmd
    .command("resend-validator-registration")
    .description("Resend validator registration transaction")
    .addArgument(argBalancerAddress)
    .addArgument(ArgNodeID("nodeId", "Node ID"))
    .asyncAction({ signer: true }, async (config, balancerAddress, nodeId) => {
      const balancer = await getBalancerValidatorManager(config, balancerAddress);
      const nodeIdHex32 = parseNodeID(nodeId, false)
      const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
      const hash = await balancer.safeWrite.resendRegisterValidatorMessage([validationId]);
      logger.log("resendValidatorRegistration executed successfully, tx hash:", hash);
    }
    );

  balancerCmd
    .command("resend-weight-update")
    .description("Resend validator weight update transaction")
    .addArgument(argBalancerAddress)
    .addArgument(ArgNodeID("nodeId", "Node ID"))
    .asyncAction({ signer: true }, async (config, balancerAddress, nodeId) => {
      const balancer = await getBalancerValidatorManager(config, balancerAddress);
      const nodeIdHex32 = parseNodeID(nodeId, false)
      const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
      const hash = await balancer.safeWrite.resendValidatorWeightUpdate([validationId]);
      logger.log("resendWeightUpdate executed successfully, tx hash:", hash);
    }
    );

  balancerCmd
    .command("resend-validator-removal")
    .description("Resend validator removal transaction")
    .addArgument(argBalancerAddress)
    .addArgument(ArgNodeID("nodeId", "Node ID"))
    .asyncAction({ signer: true }, async (config, balancerAddress, nodeId) => {
      const balancer = await getBalancerValidatorManager(config, balancerAddress);
      const nodeIdHex32 = parseNodeID(nodeId, false)
      const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
      const hash = await balancer.safeWrite.resendValidatorRemovalMessage([validationId]);
      logger.log("resendValidatorRemoval executed successfully, tx hash:", hash);
    }
    );

  balancerCmd
    .command("transfer-l1-ownership")
    .description("Transfer Validator manager, balancer and its security modules ownership to a new owner")
    .addArgument(argBalancerAddress)
    .addArgument(ArgAddress("newOwner", "New owner address"))
    .asyncAction({ signer: true }, async (config, balancerAddress, newOwner) => {
      const balancer = await getBalancerValidatorManager(config, balancerAddress);
      const VMTx = await balancer.safeWrite.transferValidatorManagerOwnership([newOwner]);
      logger.log("transferValidatorManagerOwnership executed successfully, tx hash:", VMTx);
      const BTx = await balancer.safeWrite.transferOwnership([newOwner]);
      logger.log("transferOwnership of balancer executed successfully, tx hash:", BTx);
      const securityModules = await balancer.read.getSecurityModules();
      for (const smAddress of securityModules) {
        const smOwnable = await getOwnable(config, smAddress);

        const SMTx = await smOwnable.safeWrite.transferOwnership([newOwner])
        logger.log(`transferOwnership of security module ${smAddress} executed successfully, tx hash:`, SMTx);
        const smAccessControl = await getAccessControl(config, smAddress);
        const isAccessControl = await smAccessControl.read.supportsInterface(["0x7965db0b"])
        if (isAccessControl) {
          const ROLETX = await smAccessControl.safeWrite.grantRole([await smAccessControl.read.DEFAULT_ADMIN_ROLE(), newOwner])
          logger.log(`grantRole DEFAULT_ADMIN_ROLE to ${newOwner} on security module ${smAddress} executed successfully, tx hash:`, ROLETX);
        }

      }
    });
}
