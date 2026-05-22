import type { Address } from 'viem';
import { getContract } from '../client/viemUtils';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { EnhancedContract, SafeEnhancedContract } from '../client/viemUtils';
import { selectors } from './selectors';

import errors from './errors';

const baseAbi = [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "whoRegistry",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "whereRegistry",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "name",
                "type": "string",
                "internalType": "string"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "EIP712DomainChanged",
        "inputs": [],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "IncreaseNonce",
        "inputs": [
            {
                "name": "who",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "where",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "OptIn",
        "inputs": [
            {
                "name": "who",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "where",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "OptOut",
        "inputs": [
            {
                "name": "who",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "where",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "function",
        "name": "WHERE_REGISTRY",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "WHO_REGISTRY",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "eip712Domain",
        "inputs": [],
        "outputs": [
            {
                "name": "fields",
                "type": "bytes1",
                "internalType": "bytes1"
            },
            {
                "name": "name",
                "type": "string",
                "internalType": "string"
            },
            {
                "name": "version",
                "type": "string",
                "internalType": "string"
            },
            {
                "name": "chainId",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "verifyingContract",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "salt",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "extensions",
                "type": "uint256[]",
                "internalType": "uint256[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "increaseNonce",
        "inputs": [
            {
                "name": "where",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "isOptedIn",
        "inputs": [
            {
                "name": "who",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "where",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "isOptedInAt",
        "inputs": [
            {
                "name": "who",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "where",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "timestamp",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "hint",
                "type": "bytes",
                "internalType": "bytes"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "nonces",
        "inputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "optIn",
        "inputs": [
            {
                "name": "where",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "optOut",
        "inputs": [
            {
                "name": "where",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "staticDelegateCall",
        "inputs": [
            {
                "name": "target",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "data",
                "type": "bytes",
                "internalType": "bytes"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    }
] as const;
const abi = [...baseAbi, ...errors] as const;
(abi as any).contractName = 'OperatorL1OptInService';

export async function getOperatorL1OptInService<C extends ExtendedClient>(
  client: C,
  address?: Address,
): Promise<C extends ExtendedWalletClient ? SafeEnhancedContract<typeof abi, C> : EnhancedContract<typeof abi, C>> {
  return getContract(abi, 'OperatorL1OptInService', client, address, selectors);
}

export type TOperatorL1OptInServiceABI = typeof abi;
export default abi;
