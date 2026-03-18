export const StakingVaultABI = [
    {
        "type": "function",
        "name": "getStakingManager",
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
        "name": "initiateValidatorRegistration",
        "inputs": [
            {
                "name": "",
                "type": "bytes",
                "internalType": "bytes"
            },
            {
                "name": "",
                "type": "bytes",
                "internalType": "bytes"
            },
            {
                "name": "",
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
                "name": "",
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
                "name": "",
                "type": "uint256",
                "internalType": "uint256"
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
        "name": "completeValidatorRegistration",
        "inputs": [
            {
                "name": "",
                "type": "uint32",
                "internalType": "uint32"
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
        "name": "initiateValidatorRemoval",
        "inputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "completeValidatorRemoval",
        "inputs": [
            {
                "name": "",
                "type": "uint32",
                "internalType": "uint32"
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
        "name": "initiateDelegatorRegistration",
        "inputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "completeDelegatorRegistration",
        "inputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "",
                "type": "uint32",
                "internalType": "uint32"
            },
            {
                "name": "",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "initiateDelegatorRemoval",
        "inputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "completeDelegatorRemoval",
        "inputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "getDelegatorInfo",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "internalType": "struct Delegator",
                "components": [
                    {
                        "name": "status",
                        "type": "uint8",
                        "internalType": "enum DelegatorStatus"
                    },
                    {
                        "name": "owner",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "validationID",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    },
                    {
                        "name": "weight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "startTime",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "startingNonce",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "endingNonce",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "lastRewardClaimTime",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "lastClaimUptimeSeconds",
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
        "name": "forceRemoveValidator",
        "inputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "forceRemoveDelegator",
        "inputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "StakingVault__ValidatorRegistrationInitiated",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "StakingVault__ValidatorRegistrationCompleted",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "StakingVault__ValidatorRemovalInitiated",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "StakingVault__ValidatorRemovalCompleted",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "stakeReturned",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "rewards",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "StakingVault__DelegatorRegistrationInitiated",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": false,
                "internalType": "bytes32"
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
        "name": "StakingVault__DelegatorRemovalInitiated",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            }
        ],
        "anonymous": false
    },
    {
        "type": "function",
        "name": "claimOperatorFees",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "StakingVault__OperatorFeesClaimed",
        "inputs": [
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
            }
        ],
        "anonymous": false
    },
    {
        "type": "error",
        "name": "StakingVault__NoFeesToClaim",
        "inputs": []
    }
] as const
