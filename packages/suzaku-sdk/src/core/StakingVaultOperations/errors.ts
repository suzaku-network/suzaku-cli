const errors = [
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
        "name": "StakingVault__AllocationExceeded",
        "inputs": [
            {
                "name": "total",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__ArrayLengthMismatch",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__DelegationFeeTooHigh",
        "inputs": [
            {
                "name": "actual",
                "type": "uint16",
                "internalType": "uint16"
            },
            {
                "name": "maxAllowed",
                "type": "uint16",
                "internalType": "uint16"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__DelegatorAlreadyPendingRemoval",
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
        "name": "StakingVault__DelegatorIncomplete",
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
        "name": "StakingVault__DelegatorNotFound",
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
        "name": "StakingVault__ExceedsOperatorAllocation",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "requested",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "available",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__ExternalValidatorNotFound",
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
        "name": "StakingVault__InsufficientBuffer",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__InvalidAmount",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__InvalidFeeRecipient",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__InvalidOperatorIndex",
        "inputs": [
            {
                "name": "index",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__LimitExceeded",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__MinStakeDurationMismatch",
        "inputs": [
            {
                "name": "validatorDuration",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "requiredDuration",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__NoEligibleStake",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__NoFeesToClaim",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__NotDelegatorOperator",
        "inputs": [
            {
                "name": "delegationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "caller",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__NotOperator",
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
        "name": "StakingVault__NotOperatorManager",
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
        "name": "StakingVault__OperatorAlreadyExists",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__OperatorDebtTooHigh",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "currentDebt",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__OperatorHasActiveValidators",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__OperatorHasDelegators",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__OperatorHasUnclaimedFees",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__OperatorNotActive",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__ReentrancyGuardReentrantCall",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__StakeExceedsMaximum",
        "inputs": [
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maximum",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__StakingManagerCallFailed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__TransferFailed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__ValidatorNotFound",
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
        "name": "StakingVault__ValidatorNotOwnedByOperator",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__ValidatorPendingRemoval",
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
        "name": "StakingVault__ZeroAddress",
        "inputs": []
    }
] as const;

export type TStakingVaultOperationsErrors = typeof errors;
export default errors;
