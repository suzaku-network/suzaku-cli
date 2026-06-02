import { utils, secp256k1 } from '@avalabs/avalanchejs';
import { hexToBytes } from '@noble/hashes/utils';
import { Address } from 'micro-eth-signer';
import { type Hex } from 'viem';
import { type Addresses } from '../core/client/types';
import { getHRP } from '../core/client/createAvalancheWalletExtendedClient';
import { type Chain } from 'viem';

export * from '../core/lib/avalancheUtils';

export function getAddresses(privateKeyHex: string, chain: Chain): Addresses {
    const networkPrefix = getHRP(chain);
    const publicKey = secp256k1.getPublicKey(hexToBytes(privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex));
    const pChainAddress = `P-${utils.formatBech32(networkPrefix, secp256k1.publicKeyBytesToAddress(publicKey))}`;
    const cChainAddress = Address.fromPublicKey(publicKey) as Hex;
    return { C: cChainAddress, P: pChainAddress as `P-${string}` };
}

export function getCchainAddress(privateKeyHex: string): string {
    const publicKey = secp256k1.getPublicKey(hexToBytes(privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex));
    return Address.fromPublicKey(publicKey) as Hex;
}
