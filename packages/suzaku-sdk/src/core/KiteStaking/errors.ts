import ValidatorManagerErrors from '../ValidatorManager/errors';

const ownErrors = [
    {
        "type": "error",
        "name": "DelegatorIneligibleForRewards",
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
        "name": "RewardClaimFailed",
        "inputs": []
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
        "name": "ValidatorIneligibleForRewards",
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
    }
] as const;
const errors = [...ownErrors, ...ValidatorManagerErrors] as const;

export type TKiteStakingManagerErrors = typeof errors;
export default errors;
