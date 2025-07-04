export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "vaultRegistry",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "owner",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "middlewareAddress",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "VAULT_REGISTRY",
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
        "name": "getVaultAssetClass",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "uint96",
                "internalType": "uint96"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getVaultAtWithTimes",
        "inputs": [
            {
                "name": "index",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "enabledTime",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "disabledTime",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getVaultCount",
        "inputs": [],
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
        "name": "middleware",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract AvalancheL1Middleware"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "owner",
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
        "name": "registerVault",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "vaultMaxL1Limit",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "removeVault",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "renounceOwnership",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "slashVault",
        "inputs": [],
        "outputs": [],
        "stateMutability": "pure"
    },
    {
        "type": "function",
        "name": "transferOwnership",
        "inputs": [
            {
                "name": "newOwner",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "updateVaultMaxL1Limit",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "vaultMaxL1Limit",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "vaultToAssetClass",
        "inputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "uint96",
                "internalType": "uint96"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "event",
        "name": "OwnershipTransferred",
        "inputs": [
            {
                "name": "previousOwner",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "newOwner",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__AssetClassNotActive",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__CollateralNotInAssetClass",
        "inputs": [
            {
                "name": "collateral",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NotVault",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__SlasherNotImplemented",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__VaultAlreadyRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__VaultEpochTooShort",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__VaultGracePeriodNotPassed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__VaultNotDisabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__WrongVaultAssetClass",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__ZeroAddress",
        "inputs": [
            {
                "name": "name",
                "type": "string",
                "internalType": "string"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__ZeroVaultMaxL1Limit",
        "inputs": []
    },
    {
        "type": "error",
        "name": "EnumerableMapNonexistentKey",
        "inputs": [
            {
                "name": "key",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "MapWithTimeData__AlreadyAdded",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MapWithTimeData__AlreadyDisabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MapWithTimeData__AlreadyEnabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MapWithTimeData__NotEnabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OwnableInvalidOwner",
        "inputs": [
            {
                "name": "owner",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "OwnableUnauthorizedAccount",
        "inputs": [
            {
                "name": "account",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "SafeCastOverflowedUintDowncast",
        "inputs": [
            {
                "name": "bits",
                "type": "uint8",
                "internalType": "uint8"
            },
            {
                "name": "value",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    }
] as const;
