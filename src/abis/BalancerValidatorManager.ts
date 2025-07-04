export default [
    {
        "type": "constructor",
        "inputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "ADDRESS_LENGTH",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "BALANCER_VALIDATOR_MANAGER_STORAGE_LOCATION",
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
        "name": "BLS_PUBLIC_KEY_LENGTH",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint8",
                "internalType": "uint8"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "MAXIMUM_CHURN_PERCENTAGE_LIMIT",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint8",
                "internalType": "uint8"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "MAXIMUM_REGISTRATION_EXPIRY_LENGTH",
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
        "name": "P_CHAIN_BLOCKCHAIN_ID",
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
        "name": "VALIDATOR_MANAGER_STORAGE_LOCATION",
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
        "name": "WARP_MESSENGER",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract IWarpMessenger"
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
        "name": "completeValidatorWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
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
        "name": "getChurnPeriodSeconds",
        "inputs": [],
        "outputs": [
            {
                "name": "churnPeriodSeconds",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getCurrentChurnPeriod",
        "inputs": [],
        "outputs": [
            {
                "name": "churnPeriod",
                "type": "tuple",
                "internalType": "struct ValidatorChurnPeriod",
                "components": [
                    {
                        "name": "startedAt",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "initialWeight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "totalWeight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "churnAmount",
                        "type": "uint64",
                        "internalType": "uint64"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getMaximumChurnPercentage",
        "inputs": [],
        "outputs": [
            {
                "name": "maximumChurnPercentage",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getSecurityModuleWeights",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "weight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "maxWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getSecurityModules",
        "inputs": [],
        "outputs": [
            {
                "name": "securityModules",
                "type": "address[]",
                "internalType": "address[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getValidator",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "internalType": "struct Validator",
                "components": [
                    {
                        "name": "status",
                        "type": "uint8",
                        "internalType": "enum ValidatorStatus"
                    },
                    {
                        "name": "nodeID",
                        "type": "bytes",
                        "internalType": "bytes"
                    },
                    {
                        "name": "startingWeight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "messageNonce",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "weight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "startedAt",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "endedAt",
                        "type": "uint64",
                        "internalType": "uint64"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "initialize",
        "inputs": [
            {
                "name": "settings",
                "type": "tuple",
                "internalType": "struct BalancerValidatorManagerSettings",
                "components": [
                    {
                        "name": "baseSettings",
                        "type": "tuple",
                        "internalType": "struct ValidatorManagerSettings",
                        "components": [
                            {
                                "name": "l1ID",
                                "type": "bytes32",
                                "internalType": "bytes32"
                            },
                            {
                                "name": "churnPeriodSeconds",
                                "type": "uint64",
                                "internalType": "uint64"
                            },
                            {
                                "name": "maximumChurnPercentage",
                                "type": "uint8",
                                "internalType": "uint8"
                            }
                        ]
                    },
                    {
                        "name": "initialOwner",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "initialSecurityModule",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "initialSecurityModuleMaxWeight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "migratedValidations",
                        "type": "bytes32[]",
                        "internalType": "bytes32[]"
                    }
                ]
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
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "internalType": "struct Validator",
                "components": [
                    {
                        "name": "status",
                        "type": "uint8",
                        "internalType": "enum ValidatorStatus"
                    },
                    {
                        "name": "nodeID",
                        "type": "bytes",
                        "internalType": "bytes"
                    },
                    {
                        "name": "startingWeight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "messageNonce",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "weight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "startedAt",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "endedAt",
                        "type": "uint64",
                        "internalType": "uint64"
                    }
                ]
            }
        ],
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
        "name": "initializeValidatorWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "newWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ],
        "outputs": [
            {
                "name": "validator",
                "type": "tuple",
                "internalType": "struct Validator",
                "components": [
                    {
                        "name": "status",
                        "type": "uint8",
                        "internalType": "enum ValidatorStatus"
                    },
                    {
                        "name": "nodeID",
                        "type": "bytes",
                        "internalType": "bytes"
                    },
                    {
                        "name": "startingWeight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "messageNonce",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "weight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "startedAt",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "endedAt",
                        "type": "uint64",
                        "internalType": "uint64"
                    }
                ]
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "isValidatorPendingWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
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
        "name": "registeredValidators",
        "inputs": [
            {
                "name": "nodeID",
                "type": "bytes",
                "internalType": "bytes"
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
        "name": "resendValidatorWeightUpdate",
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
        "name": "setUpSecurityModule",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "maxWeight",
                "type": "uint64",
                "internalType": "uint64"
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
        "name": "SetUpSecurityModule",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "maxWeight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
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
        "name": "BalancerValidatorManager__InvalidNonce",
        "inputs": [
            {
                "name": "nonce",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__MigratedValidationsTotalWeightMismatch",
        "inputs": [
            {
                "name": "migratedValidationsTotalWeight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "currentL1TotalWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__NewWeightIsZero",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__NoPendingWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__PendingWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__SecurityModuleAlreadyRegistered",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__SecurityModuleMaxWeightExceeded",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "weight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "maxWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__SecurityModuleNewMaxWeightLowerThanCurrentWeight",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "newMaxWeight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "currentWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__SecurityModuleNotRegistered",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__ValidatorNotBelongingToSecurityModule",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__WeightUpdateMismatch",
        "inputs": [
            {
                "name": "newWeight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "expectedWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
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
        "name": "InvalidBLSKeyLength",
        "inputs": [
            {
                "name": "length",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidConversionID",
        "inputs": [
            {
                "name": "encodedConversionID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "expectedConversionID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidInitialization",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidInitializationStatus",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidMaximumChurnPercentage",
        "inputs": [
            {
                "name": "maximumChurnPercentage",
                "type": "uint8",
                "internalType": "uint8"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidNodeID",
        "inputs": [
            {
                "name": "nodeID",
                "type": "bytes",
                "internalType": "bytes"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidPChainOwnerThreshold",
        "inputs": [
            {
                "name": "threshold",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "addressesLength",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidRegistrationExpiry",
        "inputs": [
            {
                "name": "registrationExpiry",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidTotalWeight",
        "inputs": [
            {
                "name": "weight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidationID",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidatorManagerAddress",
        "inputs": [
            {
                "name": "validatorManagerAddress",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidatorManagerBlockchainID",
        "inputs": [
            {
                "name": "blockchainID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidatorStatus",
        "inputs": [
            {
                "name": "status",
                "type": "uint8",
                "internalType": "enum ValidatorStatus"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidWarpMessage",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidWarpOriginSenderAddress",
        "inputs": [
            {
                "name": "senderAddress",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidWarpSourceChainID",
        "inputs": [
            {
                "name": "sourceChainID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "MaxChurnRateExceeded",
        "inputs": [
            {
                "name": "churnAmount",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "NodeAlreadyRegistered",
        "inputs": [
            {
                "name": "nodeID",
                "type": "bytes",
                "internalType": "bytes"
            }
        ]
    },
    {
        "type": "error",
        "name": "NotInitializing",
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
        "name": "PChainOwnerAddressesNotSorted",
        "inputs": []
    },
    {
        "type": "error",
        "name": "UnexpectedRegistrationStatus",
        "inputs": [
            {
                "name": "validRegistration",
                "type": "bool",
                "internalType": "bool"
            }
        ]
    }
] as const;
