export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "init",
                "type": "uint8",
                "internalType": "enum ICMInitializable"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "AdminForceValidatorRemoval",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "forfeitRewards",
                "type": "bool",
                "indexed": false,
                "internalType": "bool"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "CompletedDelegatorRegistration",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "startTime",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "CompletedDelegatorRemoval",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "stakeAmount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "rewards",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "fees",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "CompletedStakingValidatorRemoval",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "stakeAmount",
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
        "name": "DelegationFeesAccrued",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
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
        "name": "DelegationFeesWithdrawn",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "recipient",
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
        "type": "event",
        "name": "DelegatorRewardClaimed",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "recipient",
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
        "type": "event",
        "name": "DelegatorRewardRecipientChanged",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "recipient",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "oldRecipient",
                "type": "address",
                "indexed": true,
                "internalType": "address"
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
        "name": "InitiatedDelegatorRegistration",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "delegatorAddress",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "nonce",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "validatorWeight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "delegatorWeight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "setWeightMessageID",
                "type": "bytes32",
                "indexed": false,
                "internalType": "bytes32"
            },
            {
                "name": "rewardRecipient",
                "type": "address",
                "indexed": false,
                "internalType": "address"
            },
            {
                "name": "stakeAmount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "InitiatedDelegatorRemoval",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
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
        "name": "InitiatedStakingValidatorRegistration",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "owner",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "delegationFeeBips",
                "type": "uint16",
                "indexed": false,
                "internalType": "uint16"
            },
            {
                "name": "minStakeDuration",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "rewardRecipient",
                "type": "address",
                "indexed": false,
                "internalType": "address"
            },
            {
                "name": "stakeAmount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "OperatorRoleUpdated",
        "inputs": [
            {
                "name": "account",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "granted",
                "type": "bool",
                "indexed": false,
                "internalType": "bool"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "OwnershipTransferStarted",
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
        "name": "RegistrationPauseStatusChanged",
        "inputs": [
            {
                "name": "paused",
                "type": "bool",
                "indexed": false,
                "internalType": "bool"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardCalculatorUpdated",
        "inputs": [
            {
                "name": "oldCalculator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "newCalculator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardDistributionFailed",
        "inputs": [
            {
                "name": "recipient",
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
                "name": "reason",
                "type": "string",
                "indexed": false,
                "internalType": "string"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardVaultUpdated",
        "inputs": [
            {
                "name": "oldVault",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "newVault",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "StakingConfigUpdated",
        "inputs": [
            {
                "name": "minimumStakeAmount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "maximumStakeAmount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "minimumStakeDuration",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "minimumDelegationFeeBips",
                "type": "uint16",
                "indexed": false,
                "internalType": "uint16"
            },
            {
                "name": "maximumStakeMultiplier",
                "type": "uint8",
                "indexed": false,
                "internalType": "uint8"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "UptimeUpdated",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "uptime",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ValidatorRewardClaimed",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "recipient",
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
        "type": "event",
        "name": "ValidatorRewardRecipientChanged",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "recipient",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "oldRecipient",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "error",
        "name": "FailedCall",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InsufficientBalance",
        "inputs": [
            {
                "name": "balance",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "needed",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidDelegationFee",
        "inputs": [
            {
                "name": "delegationFeeBips",
                "type": "uint16",
                "internalType": "uint16"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidDelegationID",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidDelegatorStatus",
        "inputs": [
            {
                "name": "status",
                "type": "uint8",
                "internalType": "enum DelegatorStatus"
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
        "name": "InvalidMinStakeDuration",
        "inputs": [
            {
                "name": "minStakeDuration",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidNonce",
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
        "name": "InvalidRewardRecipient",
        "inputs": [
            {
                "name": "rewardRecipient",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidRewardVaultAddress",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidStakeAmount",
        "inputs": [
            {
                "name": "stakeAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidStakeMultiplier",
        "inputs": [
            {
                "name": "maximumStakeMultiplier",
                "type": "uint8",
                "internalType": "uint8"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidUptimeBlockchainID",
        "inputs": [
            {
                "name": "uptimeBlockchainID",
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
        "name": "MaxWeightExceeded",
        "inputs": [
            {
                "name": "newValidatorWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "MinStakeDurationNotPassed",
        "inputs": [
            {
                "name": "endTime",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "NoRewardsToClaim",
        "inputs": []
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
        "name": "ReentrancyGuardReentrantCall",
        "inputs": []
    },
    {
        "type": "error",
        "name": "RegistrationPaused",
        "inputs": []
    },
    {
        "type": "error",
        "name": "RewardClaimFailed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "UnauthorizedOperator",
        "inputs": [
            {
                "name": "caller",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "UnauthorizedOwner",
        "inputs": [
            {
                "name": "sender",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "UnexpectedValidationID",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "expectedValidationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "ValidatorNotPoS",
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
        "name": "ZeroAddress",
        "inputs": []
    },
    {
        "type": "error",
        "name": "ZeroWeightToValueFactor",
        "inputs": []
    },
    {
        "type": "function",
        "name": "BIPS_CONVERSION_FACTOR",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint16",
                "internalType": "uint16"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "KITE_STAKING_MANAGER_STORAGE_LOCATION",
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
        "name": "MAXIMUM_DELEGATION_FEE_BIPS",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint16",
                "internalType": "uint16"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "MAXIMUM_STAKE_MULTIPLIER_LIMIT",
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
        "name": "STAKING_MANAGER_STORAGE_LOCATION",
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
        "name": "acceptOwnership",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "changeDelegatorRewardRecipient",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "rewardRecipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "changeValidatorRewardRecipient",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "rewardRecipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimDelegatorRewards",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
            },
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "reward",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimDelegatorRewardsFor",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
            },
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "reward",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimValidatorRewards",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
            },
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "reward",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimValidatorRewardsFor",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
            },
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "reward",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "completeDelegatorRegistration",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            },
            {
                "name": "uptimeMessageIndex",
                "type": "uint32",
                "internalType": "uint32"
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
                "name": "delegationID",
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
        "name": "completeValidatorRegistration",
        "inputs": [
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "completeValidatorRemoval",
        "inputs": [
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "forceInitiateDelegatorRemoval",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
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
        "name": "forceInitiateValidatorRemoval",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
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
        "name": "forceRemoveValidator",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
            },
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            },
            {
                "name": "forfeitRewards",
                "type": "bool",
                "internalType": "bool"
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
        "name": "getDelegatorPendingRewards",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [
            {
                "name": "grossReward",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "validatorFee",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "netReward",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getDelegatorRewardInfo",
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
                "type": "address",
                "internalType": "address"
            },
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
        "name": "getRewardCalculator",
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
        "name": "getRewardVault",
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
        "name": "getStakingConfig",
        "inputs": [],
        "outputs": [
            {
                "name": "minimumStakeAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maximumStakeAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "minimumStakeDuration",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "minimumDelegationFeeBips",
                "type": "uint16",
                "internalType": "uint16"
            },
            {
                "name": "maximumStakeMultiplier",
                "type": "uint8",
                "internalType": "uint8"
            },
            {
                "name": "weightToValueFactor",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getStakingManagerSettings",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "internalType": "struct StakingManagerSettings",
                "components": [
                    {
                        "name": "manager",
                        "type": "address",
                        "internalType": "contract IValidatorManager"
                    },
                    {
                        "name": "minimumStakeAmount",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "maximumStakeAmount",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "minimumStakeDuration",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "minimumDelegationFeeBips",
                        "type": "uint16",
                        "internalType": "uint16"
                    },
                    {
                        "name": "maximumStakeMultiplier",
                        "type": "uint8",
                        "internalType": "uint8"
                    },
                    {
                        "name": "weightToValueFactor",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "rewardCalculator",
                        "type": "address",
                        "internalType": "contract IRewardCalculator"
                    },
                    {
                        "name": "uptimeBlockchainID",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getStakingValidator",
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
                "internalType": "struct PoSValidatorInfo",
                "components": [
                    {
                        "name": "owner",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "delegationFeeBips",
                        "type": "uint16",
                        "internalType": "uint16"
                    },
                    {
                        "name": "minStakeDuration",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "uptimeSeconds",
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
        "name": "getValidatorPendingRewards",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [
            {
                "name": "stakingReward",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "delegationFees",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "totalReward",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getValidatorRewardInfo",
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
                "type": "address",
                "internalType": "address"
            },
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
        "name": "grantOperatorRole",
        "inputs": [
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
        "name": "initialize",
        "inputs": [
            {
                "name": "settings",
                "type": "tuple",
                "internalType": "struct StakingManagerSettings",
                "components": [
                    {
                        "name": "manager",
                        "type": "address",
                        "internalType": "contract IValidatorManager"
                    },
                    {
                        "name": "minimumStakeAmount",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "maximumStakeAmount",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "minimumStakeDuration",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "minimumDelegationFeeBips",
                        "type": "uint16",
                        "internalType": "uint16"
                    },
                    {
                        "name": "maximumStakeMultiplier",
                        "type": "uint8",
                        "internalType": "uint8"
                    },
                    {
                        "name": "weightToValueFactor",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "rewardCalculator",
                        "type": "address",
                        "internalType": "contract IRewardCalculator"
                    },
                    {
                        "name": "uptimeBlockchainID",
                        "type": "bytes32",
                        "internalType": "bytes32"
                    }
                ]
            },
            {
                "name": "admin",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "rewardVault",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "initiateDelegatorRegistration",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "rewardRecipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "payable"
    },
    {
        "type": "function",
        "name": "initiateDelegatorRemoval",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
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
        "name": "initiateValidatorRegistration",
        "inputs": [
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
            },
            {
                "name": "delegationFeeBips",
                "type": "uint16",
                "internalType": "uint16"
            },
            {
                "name": "minStakeDuration",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "rewardRecipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "payable"
    },
    {
        "type": "function",
        "name": "initiateValidatorRemoval",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "includeUptimeProof",
                "type": "bool",
                "internalType": "bool"
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
        "name": "isOperator",
        "inputs": [
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
        "name": "isRegistrationPaused",
        "inputs": [],
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
        "name": "pendingOwner",
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
        "name": "resendUpdateDelegator",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "revokeOperatorRole",
        "inputs": [
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
        "name": "setRegistrationPaused",
        "inputs": [
            {
                "name": "paused",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "submitUptimeProof",
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
        "name": "updateRewardCalculator",
        "inputs": [
            {
                "name": "newRewardCalculator",
                "type": "address",
                "internalType": "contract IRewardCalculator"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "updateRewardVault",
        "inputs": [
            {
                "name": "newRewardVault",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "updateStakingConfig",
        "inputs": [
            {
                "name": "minimumStakeAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maximumStakeAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "minimumStakeDuration",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "minimumDelegationFeeBips",
                "type": "uint16",
                "internalType": "uint16"
            },
            {
                "name": "maximumStakeMultiplier",
                "type": "uint8",
                "internalType": "uint8"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "valueToWeight",
        "inputs": [
            {
                "name": "value",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
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
        "name": "weightToValue",
        "inputs": [
            {
                "name": "weight",
                "type": "uint64",
                "internalType": "uint64"
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
    }
] as const;
