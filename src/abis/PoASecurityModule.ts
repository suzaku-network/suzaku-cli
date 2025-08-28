export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "balancerValidatorManager_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "initialOwner",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "balancerValidatorManager",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract IBalancerValidatorManager"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "completeEndValidation",
        "inputs": [
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "completeValidatorRegistration",
        "inputs": [
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "initializeEndValidation",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "initializeValidatorRegistration",
        "inputs": [
            {
                "name": "registrationInput",
                "type": "tuple",
                "internalType": "struct ValidatorRegistrationInput",
                "components": [
                    {
                        "name": "nodeID",
                        "type": "bytes",
                        "internalType": "bytes"
                    },
                    {
                        "name": "blsPublicKey",
                        "type": "bytes",
                        "internalType": "bytes"
                    },
                    {
                        "name": "registrationExpiry",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "remainingBalanceOwner",
                        "type": "tuple",
                        "internalType": "struct PChainOwner",
                        "components": [
                            {
                                "name": "threshold",
                                "type": "uint32",
                                "internalType": "uint32"
                            },
                            {
                                "name": "addresses",
                                "type": "address[]",
                                "internalType": "address[]"
                            }
                        ]
                    },
                    {
                        "name": "disableOwner",
                        "type": "tuple",
                        "internalType": "struct PChainOwner",
                        "components": [
                            {
                                "name": "threshold",
                                "type": "uint32",
                                "internalType": "uint32"
                            },
                            {
                                "name": "addresses",
                                "type": "address[]",
                                "internalType": "address[]"
                            }
                        ]
                    }
                ]
            },
            {
                "name": "weight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "outputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "initializeValidatorSet",
        "inputs": [
            {
                "name": "conversionData",
                "type": "tuple",
                "internalType": "struct ConversionData",
                "components": [
                    {
                        "name": "l1ID",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    },
                    {
                        "name": "validatorManagerBlockchainID",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    },
                    {
                        "name": "validatorManagerAddress",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "initialValidators",
                        "type": "tuple[]",
                        "internalType": "struct InitialValidator[]",
                        "components": [
                            {
                                "name": "nodeID",
                                "type": "bytes",
                                "internalType": "bytes"
                            },
                            {
                                "name": "blsPublicKey",
                                "type": "bytes",
                                "internalType": "bytes"
                            },
                            {
                                "name": "weight",
                                "type": "uint64",
                                "internalType": "uint64"
                            }
                        ]
                    }
                ]
            },
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
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
        "name": "resendEndValidatorMessage",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "resendRegisterValidatorMessage",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
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
        "name": "InitialValidatorCreated",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "nodeID",
                "type": "bytes",
                "indexed": true,
                "internalType": "bytes"
            },
            {
                "name": "weight",
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
        "name": "ValidationPeriodCreated",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "nodeID",
                "type": "bytes",
                "indexed": true,
                "internalType": "bytes"
            },
            {
                "name": "registerValidationMessageID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "weight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "registrationExpiry",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ValidationPeriodEnded",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "status",
                "type": "uint8",
                "indexed": true,
                "internalType": "enum ValidatorStatus"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ValidationPeriodRegistered",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "weight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "timestamp",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ValidatorRemovalInitialized",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "setWeightMessageID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "weight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "endTime",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ValidatorWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "nonce",
                "type": "uint64",
                "indexed": true,
                "internalType": "uint64"
            },
            {
                "name": "weight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "setWeightMessageID",
                "type": "bytes32",
                "indexed": false,
                "internalType": "bytes32"
            }
        ],
        "anonymous": false
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
        "name": "ZeroAddress",
        "inputs": []
    }
] as const;
