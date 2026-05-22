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
        "name": "AvalancheL1Middleware__ActiveSecondaryCollateralClass",
        "inputs": [
            {
                "name": "collateralClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__AssetStillInUse",
        "inputs": [
            {
                "name": "collateralClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__CannotCacheFutureEpoch",
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
        "name": "AvalancheL1Middleware__CollateralClassNotActive",
        "inputs": [
            {
                "name": "collateralClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__CollateralNotInCollateralClass",
        "inputs": [
            {
                "name": "collateral",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateralClassId",
                "type": "uint96",
                "internalType": "uint96"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__EpochError",
        "inputs": [
            {
                "name": "epochStartTs",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__InsufficientStake",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__InvalidNodeIdFormat",
        "inputs": [
            {
                "name": "nodeId",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__InvalidStakeAmount",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__InvalidWindow",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__ManualEpochUpdateRequired",
        "inputs": [
            {
                "name": "epochsPending",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__MessageNotForThisModule",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "ownerModule",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NoEpochsToProcess",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NodeNotFound",
        "inputs": [
            {
                "name": "nodeId",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NodePending",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NodeStateNotUpdated",
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
        "name": "AvalancheL1Middleware__NotEpochUpdatePeriod",
        "inputs": [
            {
                "name": "timeNow",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "epochUpdatePeriod",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NotImplemented",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__OperatorAlreadyRegistered",
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
        "name": "AvalancheL1Middleware__OperatorGracePeriodNotPassed",
        "inputs": [
            {
                "name": "disabledTime",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "slashingWindow",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__OperatorHasActiveNodes",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "nodeCount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__OperatorNotOptedIn",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "l1ValidatorManager",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__OperatorNotRegistered",
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
        "name": "AvalancheL1Middleware__RebalanceNotRequired",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__ScaleFactorOutOfBounds",
        "inputs": [
            {
                "name": "supplied",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "minAllowed",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maxAllowed",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__SecurityModuleCapacityNotEnough",
        "inputs": [
            {
                "name": "securityModuleCapacity",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "minStake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__UnexpectedWeightUpdate",
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
        "name": "AvalancheL1Middleware__VaultManagerAlreadySet",
        "inputs": [
            {
                "name": "vaultManager",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__WeightUpdateNotPending",
        "inputs": [
            {
                "name": "validationId",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__WeightUpdatePending",
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
        "name": "AvalancheL1Middleware__ZeroAddress",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__AssetAlreadyRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__AssetDecimalsMismatch",
        "inputs": [
            {
                "name": "expected",
                "type": "uint8",
                "internalType": "uint8"
            },
            {
                "name": "actual",
                "type": "uint8",
                "internalType": "uint8"
            }
        ]
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__AssetIsPrimaryCollateralClass",
        "inputs": [
            {
                "name": "collateralClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__AssetNotFound",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__AssetsStillExist",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__CollateralClassAlreadyExists",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__CollateralClassNotFound",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__InvalidAsset",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CollateralClassRegistry__InvalidStakingRequirements",
        "inputs": []
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
        "name": "MapWithTimeData__AlreadyAdded",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MapWithTimeData__AlreadyDisabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MapWithTimeData__AlreadyEnabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MapWithTimeData__NotEnabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MiddlewareUtils__OverflowInStakeToWeight",
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
    }
] as const;

export type TL1MiddlewareErrors = typeof errors;
export default errors;
