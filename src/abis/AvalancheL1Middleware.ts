export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "settings",
                "type": "tuple",
                "internalType": "struct AvalancheL1MiddlewareSettings",
                "components": [
                    {
                        "name": "l1ValidatorManager",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "operatorRegistry",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "vaultRegistry",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "operatorL1Optin",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "epochDuration",
                        "type": "uint48",
                        "internalType": "uint48"
                    },
                    {
                        "name": "slashingWindow",
                        "type": "uint48",
                        "internalType": "uint48"
                    },
                    {
                        "name": "stakeUpdateWindow",
                        "type": "uint48",
                        "internalType": "uint48"
                    }
                ]
            },
            {
                "name": "owner",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "primaryAsset",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "primaryAssetMaxStake",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "primaryAssetMinStake",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "primaryAssetWeightScaleFactor",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "receive",
        "stateMutability": "payable"
    },
    {
        "type": "function",
        "name": "EPOCH_DURATION",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "L1_VALIDATOR_MANAGER",
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
        "name": "MAX_AUTO_EPOCH_UPDATES",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "OPERATOR_L1_OPTIN",
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
        "name": "OPERATOR_REGISTRY",
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
        "name": "PRIMARY_ASSET",
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
        "name": "PRIMARY_ASSET_CLASS",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint96",
                "internalType": "uint96"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "SLASHING_WINDOW",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "START_TIME",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "UPDATE_WINDOW",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "WEIGHT_SCALE_FACTOR",
        "inputs": [],
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
        "name": "activateSecondaryAssetClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "addAssetClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "minValidatorStake",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maxValidatorStake",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "initialAsset",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "addAssetToClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "asset",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "addNode",
        "inputs": [
            {
                "name": "nodeId",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "blsKey",
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
            },
            {
                "name": "stakeAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
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
                "internalType": "contract BalancerValidatorManager"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "calcAndCacheNodeStakeForAllOperators",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "calcAndCacheStakes",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
            }
        ],
        "outputs": [
            {
                "name": "totalStake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "completeStakeUpdate",
        "inputs": [
            {
                "name": "nodeId",
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
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "nodeId",
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
        "name": "completeValidatorRemoval",
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
        "name": "deactivateSecondaryAssetClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "disableOperator",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "enableOperator",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "forceUpdateNodes",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "limitStake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "getActiveAssetClasses",
        "inputs": [],
        "outputs": [
            {
                "name": "primary",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "secondaries",
                "type": "uint256[]",
                "internalType": "uint256[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getActiveNodesForEpoch",
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
        ],
        "outputs": [
            {
                "name": "activeNodeIds",
                "type": "bytes32[]",
                "internalType": "bytes32[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getAllOperators",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address[]",
                "internalType": "address[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getAssetClassIds",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint96[]",
                "internalType": "uint96[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getClassAssets",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "address[]",
                "internalType": "address[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getClassStakingRequirements",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "minStake",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maxStake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getCurrentEpoch",
        "inputs": [],
        "outputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getEpochAtTs",
        "inputs": [
            {
                "name": "timestamp",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "outputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getEpochStartTs",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "outputs": [
            {
                "name": "timestamp",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getNodeStake",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
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
        "name": "getOperatorAvailableStake",
        "inputs": [
            {
                "name": "operator",
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
        "name": "getOperatorNodesLength",
        "inputs": [
            {
                "name": "operator",
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
        "name": "getOperatorStake",
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
            },
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
            }
        ],
        "outputs": [
            {
                "name": "stake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getOperatorUsedStakeCached",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "registeredStake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getOperatorUsedStakeCachedPerEpoch",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "assetClass",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "getTotalStake",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "getVaultManager",
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
        "name": "initializeValidatorStakeUpdate",
        "inputs": [
            {
                "name": "nodeId",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "stakeAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "isActiveAssetClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "isAssetInClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "asset",
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
        "name": "lastGlobalNodeStakeUpdateEpoch",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "manualProcessNodeStakeCache",
        "inputs": [
            {
                "name": "numEpochsToProcess",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "nodePendingRemoval",
        "inputs": [
            {
                "name": "",
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
        "name": "nodePendingUpdate",
        "inputs": [
            {
                "name": "",
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
        "name": "nodeStakeCache",
        "inputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
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
        "name": "operatorLockedStake",
        "inputs": [
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
        "name": "operatorNodesArray",
        "inputs": [
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
        "name": "operatorStakeCache",
        "inputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "rebalancedThisEpoch",
        "inputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
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
        "name": "registerOperator",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "removeAssetClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "removeAssetFromClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "asset",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "removeNode",
        "inputs": [
            {
                "name": "nodeId",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "removeOperator",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
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
        "name": "setVaultManager",
        "inputs": [
            {
                "name": "vaultManager_",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "slash",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "assetClassId",
                "type": "uint96",
                "internalType": "uint96"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "totalStakeCache",
        "inputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "totalStakeCached",
        "inputs": [
            {
                "name": "",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "",
                "type": "uint96",
                "internalType": "uint96"
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
        "name": "AllNodeStakesUpdated",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "newStake",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "AssetAdded",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "indexed": true,
                "internalType": "uint256"
            },
            {
                "name": "asset",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "AssetClassAdded",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "indexed": true,
                "internalType": "uint256"
            },
            {
                "name": "primaryAssetMinStake",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "primaryAssetMaxStake",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "AssetClassRemoved",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "indexed": true,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "AssetRemoved",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "indexed": true,
                "internalType": "uint256"
            },
            {
                "name": "asset",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "NodeAdded",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "nodeId",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "stake",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
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
        "name": "NodeRemoved",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "nodeId",
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
        "name": "NodeStakeCacheManuallyProcessed",
        "inputs": [
            {
                "name": "upToEpoch",
                "type": "uint48",
                "indexed": false,
                "internalType": "uint48"
            },
            {
                "name": "epochsProcessedCount",
                "type": "uint48",
                "indexed": false,
                "internalType": "uint48"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "NodeStakeUpdated",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "nodeId",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "newStake",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
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
        "name": "OperatorHasLeftoverStake",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "leftoverStake",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
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
        "name": "VaultManagerUpdated",
        "inputs": [
            {
                "name": "oldVaultManager",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "newVaultManager",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__AssetAlreadyRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__AssetClassAlreadyExists",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__AssetClassNotFound",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__AssetIsPrimaryAssetClass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__AssetNotFound",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__AssetsStillExist",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__InvalidAsset",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AssetClassRegistry__InvalidStakingRequirements",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__ActiveSecondaryAssetCLass",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__AlreadyRebalanced",
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
        "name": "AvalancheL1Middleware__AssetClassNotActive",
        "inputs": [
            {
                "name": "assetClassId",
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
                "name": "assetClassId",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__CollateralNotInAssetClass",
        "inputs": [
            {
                "name": "collateral",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "assetClassId",
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
        "name": "AvalancheL1Middleware__InvalidScaleFactor",
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
            },
            {
                "name": "maxAutoUpdates",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__MaxL1LimitZero",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NoEpochsToProcess",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NoSlasher",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NodeNotActive",
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
        "name": "AvalancheL1Middleware__NodePendingRemoval",
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
        "name": "AvalancheL1Middleware__NodePendingUpdate",
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
        "name": "AvalancheL1Middleware__NotEnoughFreeStake",
        "inputs": [
            {
                "name": "newStake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__NotEnoughFreeStakeSecondaryAssetClasses",
        "inputs": []
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
        "name": "AvalancheL1Middleware__SlashingWindowTooShort",
        "inputs": [
            {
                "name": "slashingWindow",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "epochDuration",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__StakeTooHigh",
        "inputs": [
            {
                "name": "newStake",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maxStake",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__StakeTooLow",
        "inputs": [
            {
                "name": "newStake",
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
        "name": "AvalancheL1Middleware__TooBigSlashAmount",
        "inputs": []
    },
    {
        "type": "error",
        "name": "AvalancheL1Middleware__TooManyEpochsRequested",
        "inputs": [
            {
                "name": "requested",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "pending",
                "type": "uint48",
                "internalType": "uint48"
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
        "inputs": [
            {
                "name": "name",
                "type": "string",
                "internalType": "string"
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
