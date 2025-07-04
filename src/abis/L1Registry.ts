export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "feeCollector_",
                "type": "address",
                "internalType": "address payable"
            },
            {
                "name": "registerFee_",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "MAX_FEE_",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "owner",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "receive",
        "stateMutability": "payable"
    },
    {
        "type": "function",
        "name": "feeCollector",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address payable"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getAllL1s",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address[]",
                "internalType": "address[]"
            },
            {
                "name": "",
                "type": "address[]",
                "internalType": "address[]"
            },
            {
                "name": "",
                "type": "string[]",
                "internalType": "string[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getL1At",
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
            },
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "",
                "type": "string",
                "internalType": "string"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "isRegistered",
        "inputs": [
            {
                "name": "l1",
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
        "name": "isRegisteredWithMiddleware",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "vaultManager_",
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
        "name": "l1MetadataURL",
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
                "type": "string",
                "internalType": "string"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "l1Middleware",
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
                "type": "address",
                "internalType": "address"
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
        "name": "registerFee",
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
        "name": "registerL1",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "l1Middleware_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "metadataURL",
                "type": "string",
                "internalType": "string"
            }
        ],
        "outputs": [],
        "stateMutability": "payable"
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
        "name": "setFeeCollector",
        "inputs": [
            {
                "name": "newFeeCollector",
                "type": "address",
                "internalType": "address payable"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setL1Middleware",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "l1Middleware_",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setMetadataURL",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "metadataURL",
                "type": "string",
                "internalType": "string"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setRegisterFee",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "totalL1s",
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
        "name": "RegisterL1",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "SetL1Middleware",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "l1Middleware",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "SetMetadataURL",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "metadataURL",
                "type": "string",
                "indexed": false,
                "internalType": "string"
            }
        ],
        "anonymous": false
    },
    {
        "type": "error",
        "name": "L1Registry__FeeExceedsMaximum",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maxFee",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__FeeTransferFailed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__InsufficientFee",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__InvalidL1Middleware",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__InvalidValidatorManager",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__L1AlreadyRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__L1NotRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__NotMiddlewareOwner",
        "inputs": [
            {
                "name": "caller",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "expectedOwner",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__NotValidatorManagerOwner",
        "inputs": [
            {
                "name": "caller",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "expectedOwner",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__ZeroAddress",
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
