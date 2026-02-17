import { SafeSuzakuContract, SuzakuABINames, TSuzakuABI } from './lib/viemUtils';
import { type Hex, keccak256, toBytes, AbiFunction } from 'viem';


type ExtractRoleNames<T extends SuzakuABINames> = TSuzakuABI[T][number] extends infer Item
  ? Item extends { type: 'function'; stateMutability: 'view'; name: infer N extends string }
  ? N extends `${string}_ROLE`
  ? N
  : never
  : never
  : never;

export function getRoles<T extends SuzakuABINames>(contract: SafeSuzakuContract[T]): ExtractRoleNames<T>[] {
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
  accessControl: SafeSuzakuContract['AccessControl'],
  role: string,
  address: Hex
) {
  return await accessControl.read.hasRole(
    [ensureRoleHex(role), address]
  );
}

export async function getRoleAdmin(
  accessControl: SafeSuzakuContract['AccessControl'],
  role: string
) {
  return await accessControl.read.getRoleAdmin(
    [ensureRoleHex(role)]
  );
}

export async function isAccessControl(
  accessControl: SafeSuzakuContract['AccessControl']
): Promise<boolean> {
  try {
    return await accessControl.read.supportsInterface(["0x7965db0b"]);
  } catch {
    return false;
  }
}

export const ensureRoleHex = (role: string): Hex => role.startsWith("0x") ? role as Hex : role === 'DEFAULT_ADMIN_ROLE' ? "0x0000000000000000000000000000000000000000000000000000000000000000" : keccak256(toBytes(role.toUpperCase() + "()"));
