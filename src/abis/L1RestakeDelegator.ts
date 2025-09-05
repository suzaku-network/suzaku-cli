export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "l1Registry",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "vaultFactory",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "operatorVaultOptInService",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "operatorL1OptInService",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "delegatorFactory",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "entityType",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "DEFAULT_ADMIN_ROLE",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "FACTORY",
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
        "name": "HOOK_GAS_LIMIT",
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
        "name": "HOOK_RESERVE",
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
        "name": "HOOK_SET_ROLE",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "L1_LIMIT_SET_ROLE",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "L1_REGISTRY",
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
        "name": "OPERATOR_L1_OPT_IN_SERVICE",
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
        "name": "OPERATOR_L1_SHARES_SET_ROLE",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "OPERATOR_VAULT_OPT_IN_SERVICE",
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
        "name": "TYPE",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "VAULT_FACTORY",
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
        "name": "VERSION",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "stateMutability": "pure"
    },
    {
        "type": "function",
        "name": "getRoleAdmin",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "grantRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "account",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "hasRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "account",
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
        "name": "hook",
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
        "name": "initialize",
        "inputs": [
            {
                "name": "data",
                "type": "bytes",
                "internalType": "bytes"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "l1Limit",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "l1LimitAt",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
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
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "maxL1Limit",
        "inputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "onSlash",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "captureTimestamp",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "data",
                "type": "bytes",
                "internalType": "bytes"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "operatorL1Shares",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "operator",
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
        "name": "operatorL1SharesAt",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "operator",
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
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "renounceRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "callerConfirmation",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "revokeRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "account",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setHook",
        "inputs": [
            {
                "name": "hook_",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setL1Limit",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setMaxL1Limit",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setOperatorL1Shares",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "shares",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "stake",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "operator",
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
        "name": "stakeAt",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "timestamp",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "hints",
                "type": "bytes",
                "internalType": "bytes"
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
        "name": "supportsInterface",
        "inputs": [
            {
                "name": "interfaceId",
                "type": "bytes4",
                "internalType": "bytes4"
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
        "name": "totalOperatorL1Shares",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "totalOperatorL1SharesAt",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "internalType": "uint96"
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
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "vault",
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
        "type": "event",
        "name": "Initialized",
        "inputs": [
            {
                "name": "version",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "OnSlash",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "indexed": true,
                "internalType": "uint96"
            },
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "amount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "captureTimestamp",
                "type": "uint48",
                "indexed": false,
                "internalType": "uint48"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RoleAdminChanged",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "previousAdminRole",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "newAdminRole",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RoleGranted",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "account",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "sender",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RoleRevoked",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "account",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "sender",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "SetHook",
        "inputs": [
            {
                "name": "hook",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "SetL1Limit",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "indexed": true,
                "internalType": "uint96"
            },
            {
                "name": "amount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "SetMaxL1Limit",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "indexed": true,
                "internalType": "uint96"
            },
            {
                "name": "amount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "SetOperatorL1Shares",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "collateralClass",
                "type": "uint96",
                "indexed": true,
                "internalType": "uint96"
            },
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "shares",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "error",
        "name": "AccessControlBadConfirmation",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AccessControlUnauthorizedAccount",
        "inputs": [
            {
                "name": "account",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "neededRole",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "BaseDelegator__AlreadySet",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__InsufficientHookGas",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotAuthorizedMiddleware",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotInitialized",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotL1",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotSlasher",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotVault",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__ZeroAddress",
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
        "name": "CheckpointUnorderedInsertion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidInitialization",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__DuplicateRoleHolder",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__ExceedsMaxL1Limit",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__MaxL1LimitNotSet",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__MissingRoleHolders",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__ZeroAddressRoleHolder",
        "inputs": []
    },
    {
        "type": "error",
        "name": "NotInitializing",
        "inputs": []
    },
    {
        "type": "error",
        "name": "ReentrancyGuardReentrantCall",
        "inputs": []
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
    },
    {
        "type": "error",
        "name": "Vault__NotSlasher",
        "inputs": []
    }
] as const;
