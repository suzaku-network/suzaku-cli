import { SafeSuzakuContract } from './lib/viemUtils';
import { type Hex, type Account, keccak256, toBytes } from 'viem';

export async function grantRole(
  accessControl: SafeSuzakuContract['AccessControl'],
  role: string,
  address: Hex,
  account: Account
) {
  return await accessControl.safeWrite.grantRole(
    [ensureRoleHex(role), address],
    { chain: null, account }
  );
}

export async function revokeRole(
  accessControl: SafeSuzakuContract['AccessControl'],
  role: string,
  address: Hex,
  account: Account
) {
  return await accessControl.safeWrite.revokeRole(
    [ensureRoleHex(role), address],
    { chain: null, account }
  );
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

export const ensureRoleHex = (role: string): Hex => role.startsWith("0x") ? role as Hex : keccak256(toBytes(role.toUpperCase()+"()"));
