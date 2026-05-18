import { SafeSuzakuContract, SuzakuABINames, SuzakuContract, TSuzakuABI } from './lib/viemUtils';
import { type Hex, keccak256, toBytes, AbiFunction } from 'viem';
import { ArgAddress } from './lib/cliParser';
import { SuzakuCliProgram } from './cli';
import { getAccessControl } from '@suzaku-network/suzaku-sdk/core';
import { logger } from './lib/logger';

export const argAccessControlAddress = ArgAddress("accessControlAddress", "A contract address with AccessControl functionalities");

type ExtractRoleNames<T extends SuzakuABINames> = TSuzakuABI[T][number] extends infer Item
  ? Item extends { type: 'function'; stateMutability: 'view'; name: infer N extends string }
  ? N extends `${string}_ROLE`
  ? N
  : never
  : never
  : never;

export function getRoles<T extends SuzakuABINames>(contract: SuzakuContract[T]): ExtractRoleNames<T>[] {
  return contract.abi.filter((item) => item.type === 'function' && item.name && item.name.endsWith('_ROLE')).map((item) => (item as AbiFunction).name) as ExtractRoleNames<T>[];
}

export async function grantRole(
  accessControl: SafeSuzakuContract['AccessControl'],
  role: string,
  address: Hex
) {
  return await accessControl.safeWrite.grantRole([ensureRoleHex(role), address]);
}

export async function revokeRole(
  accessControl: SafeSuzakuContract['AccessControl'],
  role: string,
  address: Hex) {
  return await accessControl.safeWrite.revokeRole([ensureRoleHex(role), address]);
}

export async function hasRole(
  accessControl: SuzakuContract['AccessControl'],
  role: string,
  address: Hex
) {
  return await accessControl.read.hasRole(
    [ensureRoleHex(role), address]
  );
}

export async function getRoleAdmin(
  accessControl: SuzakuContract['AccessControl'],
  role: string
) {
  return await accessControl.read.getRoleAdmin(
    [ensureRoleHex(role)]
  );
}

export async function isAccessControl(
  accessControl: SuzakuContract['AccessControl']
): Promise<boolean> {
  try {
    return await accessControl.read.supportsInterface(["0x7965db0b"]);
  } catch {
    return false;
  }
}

export const ensureRoleHex = (role: string): Hex => role.startsWith("0x") ? role as Hex : role === 'DEFAULT_ADMIN_ROLE' ? "0x0000000000000000000000000000000000000000000000000000000000000000" : keccak256(toBytes(role.toUpperCase()));

export function addAccessControlCmd(program: SuzakuCliProgram) {
  const accessControlCmd = program
    .command("access-control")
    .description("Commands for managing access control");

  accessControlCmd
    .command("grant-role")
    .description("Grant a role to an account")
    .addArgument(argAccessControlAddress)
    .argument("role", "Role hash or name case unsensitive without '()'")
    .addArgument(ArgAddress("account", "Account address to grant the role to"))
    .asyncAction({ signer: true }, async (client, contractAddress, role, account) => {
      const accessControl = await getAccessControl(client, contractAddress);
      if (!await isAccessControl(accessControl)) {
        throw new Error("Contract does not implement AccessControl interface");
      }
      const txHash = await grantRole(
        accessControl,
        role,
        account
      );
      logger.log(`Role granted. tx hash: ${txHash}`);
    });

  accessControlCmd
    .command("revoke-role")
    .description("Revoke a role from an account")
    .addArgument(argAccessControlAddress)
    .argument("role", "Role hash or name case unsensitive")
    .addArgument(ArgAddress("account", "Account address to revoke the role from"))
    .asyncAction({ signer: true }, async (client, contractAddress, role, account) => {
      const accessControl = await getAccessControl(client, contractAddress);
      if (!await isAccessControl(accessControl)) {
        throw new Error("Contract does not implement AccessControl interface");
      }
      const txHash = await revokeRole(
        accessControl,
        role,
        account
      );
      logger.log(`Role revoked. tx hash: ${txHash}`);
    });

  accessControlCmd
    .command("has-role")
    .description("Check if an account has a specific role")
    .addArgument(argAccessControlAddress)
    .argument("role", "Role hash or name case unsensitive")
    .addArgument(ArgAddress("account", "Account address to check"))
    .asyncAction(async (client, contractAddress, role, account) => {
      const accessControl = await getAccessControl(client, contractAddress);
      if (!await isAccessControl(accessControl)) {
        throw new Error("Contract does not implement AccessControl interface");
      }
      const hasRoleResult = await hasRole(
        accessControl,
        role,
        account
      );
      logger.log(`Account ${account} has role ${role}: ${hasRoleResult}`);
    });

  accessControlCmd
    .command("get-role-admin")
    .description("Get the admin role that controls a specific role")
    .addArgument(argAccessControlAddress)
    .argument("role", "Role hash or name case unsensitive")
    .asyncAction(async (client, contractAddress, role) => {
      const accessControl = await getAccessControl(client, contractAddress);
      if (!await isAccessControl(accessControl)) {
        throw new Error("Contract does not implement AccessControl interface");
      }
      const adminRole = await getRoleAdmin(
        accessControl,
        role
      );
      logger.log(`Admin role for role ${role} is: ${adminRole}`);
    });
  return accessControlCmd;
}
