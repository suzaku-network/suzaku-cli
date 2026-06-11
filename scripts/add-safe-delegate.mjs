#!/usr/bin/env node
// One-time ops script: register the propose bot's address as a DELEGATE on the Safe.
// A delegate can queue proposals in the Safe transaction service; it can never sign
// or execute. Registration must be authorized by a Safe OWNER (the delegator) —
// run this with an owner's key, never with the bot's key.
//
// Usage (fuji):
//   NETWORK=fuji SAFE_ADDRESS=0x... DELEGATE_ADDRESS=0x... OWNER_PK=0x... \
//     node scripts/add-safe-delegate.mjs
// Usage (mainnet — additionally needs SAFE_API_KEY from developer.safe.global):
//   NETWORK=mainnet SAFE_API_KEY=... SAFE_ADDRESS=0x... DELEGATE_ADDRESS=0x... OWNER_PK=0x... \
//     node scripts/add-safe-delegate.mjs
//
// Verify afterwards:
//   curl "<txService>/api/v1/safes/<SAFE_ADDRESS>/delegates/"

import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, keccak256, toHex } from 'viem';

const {
  NETWORK = 'fuji',
  SAFE_ADDRESS,
  DELEGATE_ADDRESS,
  OWNER_PK,
  LABEL = 'suzaku-propose-bot',
  SAFE_API_KEY,
} = process.env;

if (!SAFE_ADDRESS || !DELEGATE_ADDRESS || !OWNER_PK) {
  console.error('SAFE_ADDRESS, DELEGATE_ADDRESS and OWNER_PK are required');
  process.exit(1);
}
if (NETWORK === 'mainnet' && !SAFE_API_KEY) {
  console.error('SAFE_API_KEY is required on mainnet (https://developer.safe.global)');
  process.exit(1);
}

// Same chain → tx-service mapping the CLI uses (src/client.ts)
const base = NETWORK === 'fuji'
  ? 'https://wallet-transaction-fuji.ash.center/api'
  : 'https://api.safe.global/tx-service/avax/api';
const chainId = NETWORK === 'fuji' ? 43113 : 43114;

const owner = privateKeyToAccount(OWNER_PK);
const safe = getAddress(SAFE_ADDRESS);
const delegate = getAddress(DELEGATE_ADDRESS);
const headers = { 'Content-Type': 'application/json' };
if (SAFE_API_KEY) headers.Authorization = `Bearer ${SAFE_API_KEY}`;

// The service authenticates the delegator with a signature over (delegate, totp),
// where totp = floor(unix / 3600). Newer services (v2) verify an EIP-712 payload,
// older ones (v1) a personal_sign over the concatenated string — try both.
const totp = Math.floor(Date.now() / 1000 / 3600);

async function post(path, signature) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ safe, delegate, delegator: owner.address, label: LABEL, signature }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const eip712Signature = await owner.signTypedData({
  domain: { name: 'Safe Transaction Service', version: '1.0', chainId },
  types: { Delegate: [
    { name: 'delegateAddress', type: 'address' },
    { name: 'totp', type: 'uint256' },
  ] },
  primaryType: 'Delegate',
  message: { delegateAddress: delegate, totp: BigInt(totp) },
});

let result = await post('/v2/delegates/', eip712Signature);
if (!result.ok) {
  console.error(`v2 EIP-712 registration failed (HTTP ${result.status}): ${result.text}`);
  console.error('Falling back to the v1 message-hash scheme...');
  const legacySignature = await owner.signMessage({
    message: { raw: keccak256(toHex(`${delegate}${totp}`)) },
  });
  result = await post('/v1/delegates/', legacySignature);
}

console.log(`HTTP ${result.status}: ${result.text || 'OK'}`);
if (result.ok) {
  console.log(`\nDelegate registered. Verify with:\n  curl "${base}/v1/safes/${safe}/delegates/"`);
} else {
  process.exit(1);
}
