import KiteStakingErrors from '../KiteStaking/errors';

const ownErrors = [
    {
        "type": "error",
        "name": "AccessControlBadConfirmation",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AccessControlEnforcedDefaultAdminDelay",
        "inputs": [
            {
                "name": "schedule",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AccessControlEnforcedDefaultAdminRules",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AccessControlInvalidDefaultAdmin",
        "inputs": [
            {
                "name": "defaultAdmin",
                "type": "address",
                "internalType": "address"
            }
        ]
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
        "name": "AddressEmptyCode",
        "inputs": [
            {
                "name": "target",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "ERC1967InvalidImplementation",
        "inputs": [
            {
                "name": "implementation",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "ERC1967NonPayable",
        "inputs": []
    },
    {
        "type": "error",
        "name": "ERC20InsufficientAllowance",
        "inputs": [
            {
                "name": "spender",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "allowance",
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
        "name": "ERC20InsufficientBalance",
        "inputs": [
            {
                "name": "sender",
                "type": "address",
                "internalType": "address"
            },
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
        "name": "ERC20InvalidApprover",
        "inputs": [
            {
                "name": "approver",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "ERC20InvalidReceiver",
        "inputs": [
            {
                "name": "receiver",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "ERC20InvalidSender",
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
        "name": "ERC20InvalidSpender",
        "inputs": [
            {
                "name": "spender",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "EnforcedPause",
        "inputs": []
    },
    {
        "type": "error",
        "name": "ExpectedPause",
        "inputs": []
    },
    {
        "type": "error",
        "name": "FailedCall",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidInitialization",
        "inputs": []
    },
    {
        "type": "error",
        "name": "NotInitializing",
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
        "name": "StakingVault__EpochNotEnded",
        "inputs": []
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
        "name": "StakingVault__Insolvent",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__InsufficientBalance",
        "inputs": [
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
        "name": "StakingVault__InvalidEpochDuration",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__InvalidFee",
        "inputs": [
            {
                "name": "fee",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__InvalidFeeRecipient",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__InvalidImplementation",
        "inputs": [
            {
                "name": "implementation",
                "type": "address",
                "internalType": "address"
            }
        ]
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
        "name": "StakingVault__InvalidStakingManager",
        "inputs": []
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
        "name": "StakingVault__NoEscrowedWithdrawal",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__NoFeesToClaim",
        "inputs": []
    },
    {
        "type": "error",
        "name": "StakingVault__NonTransferable",
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
        "name": "StakingVault__SlippageExceeded",
        "inputs": [
            {
                "name": "actual",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "minExpected",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
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
        "name": "StakingVault__UnauthorizedReceive",
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
        "name": "StakingVault__WithdrawalAlreadyClaimed",
        "inputs": [
            {
                "name": "requestId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__WithdrawalNotClaimable",
        "inputs": [
            {
                "name": "requestId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__WithdrawalNotFound",
        "inputs": [
            {
                "name": "requestId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "StakingVault__ZeroAddress",
        "inputs": []
    },
    {
        "type": "error",
        "name": "UUPSUnauthorizedCallContext",
        "inputs": []
    },
    {
        "type": "error",
        "name": "UUPSUnsupportedProxiableUUID",
        "inputs": [
            {
                "name": "slot",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    }
] as const;
const errors = [...ownErrors, ...KiteStakingErrors] as const;

export type TStakingVaultErrors = typeof errors;
export default errors;
