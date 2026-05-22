import type { Address } from 'viem';
import { getContract } from '../client/viemUtils';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { EnhancedContract, SafeEnhancedContract } from '../client/viemUtils';
import { selectors } from './selectors';

const abi = [
    {
        "type": "event",
        "name": "SendWarpMessage",
        "inputs": [
            {
                "name": "sender",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "messageID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "message",
                "type": "bytes",
                "indexed": false,
                "internalType": "bytes"
            }
        ],
        "anonymous": false
    },
    {
        "type": "function",
        "name": "getBlockchainID",
        "inputs": [],
        "outputs": [
            {
                "name": "blockchainID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getVerifiedWarpBlockHash",
        "inputs": [
            {
                "name": "index",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "warpBlockHash",
                "type": "tuple",
                "internalType": "struct WarpBlockHash",
                "components": [
                    {
                        "name": "sourceChainID",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    },
                    {
                        "name": "blockHash",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    }
                ]
            },
            {
                "name": "valid",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getVerifiedWarpMessage",
        "inputs": [
            {
                "name": "index",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "message",
                "type": "tuple",
                "internalType": "struct WarpMessage",
                "components": [
                    {
                        "name": "sourceChainID",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    },
                    {
                        "name": "originSenderAddress",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "payload",
                        "type": "bytes",
                        "internalType": "bytes"
                    }
                ]
            },
            {
                "name": "valid",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "sendWarpMessage",
        "inputs": [
            {
                "name": "payload",
                "type": "bytes",
                "internalType": "bytes"
            }
        ],
        "outputs": [
            {
                "name": "messageID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "nonpayable"
    }
] as const;
(abi as any).contractName = 'IWarpMessenger';

export async function getIWarpMessenger<C extends ExtendedClient>(
  client: C,
  address?: Address,
): Promise<C extends ExtendedWalletClient ? SafeEnhancedContract<typeof abi, C> : EnhancedContract<typeof abi, C>> {
  return getContract(abi, 'IWarpMessenger', client, address, selectors);
}

export type TIWarpMessengerABI = typeof abi;
export default abi;
