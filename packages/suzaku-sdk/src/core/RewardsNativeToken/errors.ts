const errors = [
    {
        "type": "error",
        "name": "AccessControlBadConfirmation",
        "inputs": []
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
        "name": "AlreadyClaimedForLatestEpoch",
        "inputs": [
            {
                "name": "staker",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AlreadyCompleted",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "CollateralClassBipsExceed10000",
        "inputs": [
            {
                "name": "totalBp",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "CollateralClassBipsNotSet",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassNotFound",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "DistributionAlreadyStarted",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "DistributionNotComplete",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "EpochNotFinished",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "EpochNotFunded",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "EpochStillClaimable",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "FeeConfigurationExceeds10000",
        "inputs": [
            {
                "name": "totalBp",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "FeePercentageTooHigh",
        "inputs": [
            {
                "name": "fee",
                "type": "uint16",
                "internalType": "uint16"
            }
        ]
    },
    {
        "type": "error",
        "name": "FundingWindowClosed",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidAdmin",
        "inputs": [
            {
                "name": "admin",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidFee",
        "inputs": [
            {
                "name": "fee",
                "type": "uint16",
                "internalType": "uint16"
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
        "name": "InvalidL1Middleware",
        "inputs": [
            {
                "name": "middleware",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidMinUptime",
        "inputs": [
            {
                "name": "minUptime",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidNumberOfEpochs",
        "inputs": [
            {
                "name": "numberOfEpochs",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidOperator",
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
        "name": "InvalidProtocolOwner",
        "inputs": [
            {
                "name": "protocolOwner",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidRecipient",
        "inputs": [
            {
                "name": "recipient",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidRewardsAmount",
        "inputs": [
            {
                "name": "rewardsAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidRewardsToken",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidShare",
        "inputs": [
            {
                "name": "share",
                "type": "uint16",
                "internalType": "uint16"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidUptimeTracker",
        "inputs": [
            {
                "name": "uptimeTracker",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "NoRewardsToClaim",
        "inputs": [
            {
                "name": "user",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "NoRewardsToClaimEpoch",
        "inputs": [
            {
                "name": "user",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "lastClaimedEpoch",
                "type": "uint48",
                "internalType": "uint48"
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
        "name": "OperatorUptimeNotSet",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
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
        "name": "RewardsAlreadyDistributed",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "RewardsDistributionTooEarly",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "requiredEpoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "SafeERC20FailedOperation",
        "inputs": [
            {
                "name": "token",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "TotalFeesExceed10000",
        "inputs": [
            {
                "name": "totalFees",
                "type": "uint16",
                "internalType": "uint16"
            }
        ]
    },
    {
        "type": "error",
        "name": "ZeroVaultStake",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    }
] as const;

export type TRewardsNativeTokenErrors = typeof errors;
export default errors;
