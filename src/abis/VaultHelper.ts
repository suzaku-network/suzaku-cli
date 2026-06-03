export default [
    {
        "type": "constructor",
        "inputs": [
            {
                "name": "vaultFactory_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "lstWrapperFactory_",
                "type": "address",
                "internalType": "address"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "error",
        "name": "ReentrancyGuardReentrantCall",
        "inputs": []
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
        "name": "VaultHelper__AssetMismatch",
        "inputs": [
            {
                "name": "expected",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "actual",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__CollateralMismatch",
        "inputs": [
            {
                "name": "expected",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "actual",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__InvalidAmount",
        "inputs": [
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__InvalidRange",
        "inputs": []
    },
    {
        "type": "error",
        "name": "VaultHelper__InvalidUser",
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
        "name": "VaultHelper__InvalidVault",
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
        "name": "VaultHelper__InvalidVaultShare",
        "inputs": [
            {
                "name": "share",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__LSTWrapperMismatch",
        "inputs": [
            {
                "name": "lstWrapper",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__ZeroAddress",
        "inputs": [
            {
                "name": "param",
                "type": "string",
                "internalType": "string"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__ZeroCollateralMint",
        "inputs": [
            {
                "name": "depositAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "collateral",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__ZeroCollateralWithdraw",
        "inputs": [
            {
                "name": "collateralAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__ZeroLSTWrapperSharesBurned",
        "inputs": [
            {
                "name": "lstSharesBurned",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__ZeroLSTWrapperSharesMinted",
        "inputs": [
            {
                "name": "lstSharesMinted",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "VaultHelper__ZeroVaultSharesMinted",
        "inputs": [
            {
                "name": "collateralAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "function",
        "name": "LST_WRAPPER_FACTORY",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract IRegistry"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "VAULT_FACTORY",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract IRegistry"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getStakerClaimableReward",
        "inputs": [
            {
                "name": "staker",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "rewards",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "internalType": "struct ClaimAmountsPerToken",
                "components": [
                    {
                        "name": "token",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "amount",
                        "type": "uint256",
                        "internalType": "uint256"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getStakerClaimableRewardInRange",
        "inputs": [
            {
                "name": "staker",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "rewards",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "fromEpoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "toEpoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "internalType": "struct ClaimAmountsPerToken",
                "components": [
                    {
                        "name": "token",
                        "type": "address",
                        "internalType": "address"
                    },
                    {
                        "name": "amount",
                        "type": "uint256",
                        "internalType": "uint256"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getUserFuturePendingWithdraws",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "user",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "pendingWithdraws",
                "type": "tuple[]",
                "internalType": "struct PendingWithdraw[]",
                "components": [
                    {
                        "name": "amount",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "epoch",
                        "type": "uint256",
                        "internalType": "uint256"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getUserPendingWithdraws",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "user",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "pendingWithdraws",
                "type": "tuple[]",
                "internalType": "struct PendingWithdraw[]",
                "components": [
                    {
                        "name": "amount",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "epoch",
                        "type": "uint256",
                        "internalType": "uint256"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getUserPendingWithdrawsInRange",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "user",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "fromEpoch",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "toEpoch",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "pendingWithdraws",
                "type": "tuple[]",
                "internalType": "struct PendingWithdraw[]",
                "components": [
                    {
                        "name": "amount",
                        "type": "uint256",
                        "internalType": "uint256"
                    },
                    {
                        "name": "epoch",
                        "type": "uint256",
                        "internalType": "uint256"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getVaultLatestDistributedRewards",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "rewards",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "stakeAssetInVault",
        "inputs": [
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "user",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "collateral",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "underlying",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "collateralAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "sharesMinted",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "stakeAssetInWrappedVault",
        "inputs": [
            {
                "name": "user",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "lstWrapper",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "collateralAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "lstSharesMinted",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "withdrawFromWrappedVault",
        "inputs": [
            {
                "name": "lstWrapper",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "collateralAmount",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "lstSharesBurned",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "nonpayable"
    }
] as const;
