export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "owner_",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "blacklist",
        "inputs": [
            {
                "name": "version",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "blacklisted",
        "inputs": [
            {
                "name": "version",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "outputs": [
            {
                "name": "value",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "create",
        "inputs": [
            {
                "name": "version",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "owner_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "data",
                "type": "bytes",
                "internalType": "bytes"
            },
            {
                "name": "delegatorFactory",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "slasherFactory",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "entity_",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "entity",
        "inputs": [
            {
                "name": "index",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
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
        "name": "implementation",
        "inputs": [
            {
                "name": "version",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
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
        "name": "isEntity",
        "inputs": [
            {
                "name": "entity_",
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
        "name": "lastVersion",
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
        "name": "migrate",
        "inputs": [
            {
                "name": "entity_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "newVersion",
                "type": "uint64",
                "internalType": "uint64"
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
        "name": "renounceOwnership",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "totalEntities",
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
        "name": "whitelist",
        "inputs": [
            {
                "name": "implementation_",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "AddEntity",
        "inputs": [
            {
                "name": "entity",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "Blacklist",
        "inputs": [
            {
                "name": "version",
                "type": "uint64",
                "indexed": true,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "Migrate",
        "inputs": [
            {
                "name": "entity",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "newVersion",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
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
        "type": "event",
        "name": "Whitelist",
        "inputs": [
            {
                "name": "implementation",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "error",
        "name": "EntityNotExist",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__AlreadyBlacklisted",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__AlreadyWhitelisted",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__InvalidImplementation",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__InvalidVersion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__NotOwner",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__OldVersion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__VersionBlacklisted",
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
    }
] as const;
