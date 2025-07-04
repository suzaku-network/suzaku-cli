export default [
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
        "name": "optIn",
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
                "name": "deadline",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "signature",
                "type": "bytes",
                "internalType": "bytes"
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
                "name": "deadline",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "signature",
                "type": "bytes",
                "internalType": "bytes"
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
        "type": "error",
        "name": "CheckpointUnorderedInsertion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidShortString",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__AlreadyOptedIn",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__ExpiredSignature",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__InvalidSignature",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotOptedIn",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotWhereEntity",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotWhereRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotWho",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__OptOutCooldown",
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
        "name": "StringTooLong",
        "inputs": [
            {
                "name": "str",
                "type": "string",
                "internalType": "string"
            }
        ]
    }
] as const;
