export default [
    {
        "type": "function",
        "name": "ADMIN_ROLE",
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
        "name": "BASIS_POINTS_DENOMINATOR",
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
        "name": "DEFAULT_ADMIN_ROLE",
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
        "name": "PROTOCOL_OWNER_ROLE",
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
        "name": "claimCuratorFee",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "recipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimOperatorFee",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "recipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimProtocolFee",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "recipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimRewards",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "recipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimUndistributedRewards",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "recipient",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "curatorFee",
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
        "name": "curatorShares",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "curator",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "share",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "distributeRewards",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "batchSize",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "distributionBatches",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "outputs": [
            {
                "name": "lastProcessedOperator",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "isComplete",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "epochDuration",
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
        "name": "getRewardsAmountPerTokenFromEpoch",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "token",
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
        "name": "getRewardsAmountPerTokenFromEpoch",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ],
        "outputs": [
            {
                "name": "tokens",
                "type": "address[]",
                "internalType": "address[]"
            },
            {
                "name": "amounts",
                "type": "uint256[]",
                "internalType": "uint256[]"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getRoleAdmin",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
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
        "name": "grantRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
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
        "name": "hasRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
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
        "name": "initialize",
        "inputs": [
            {
                "name": "admin_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "protocolOwner_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "l1Middleware_",
                "type": "address",
                "internalType": "address payable"
            },
            {
                "name": "uptimeTracker_",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "protocolFee_",
                "type": "uint16",
                "internalType": "uint16"
            },
            {
                "name": "operatorFee_",
                "type": "uint16",
                "internalType": "uint16"
            },
            {
                "name": "curatorFee_",
                "type": "uint16",
                "internalType": "uint16"
            },
            {
                "name": "minRequiredUptime_",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "l1Middleware",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract AvalancheL1Middleware"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "lastEpochClaimedCurator",
        "inputs": [
            {
                "name": "curator",
                "type": "address",
                "internalType": "address"
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
        "name": "lastEpochClaimedOperator",
        "inputs": [
            {
                "name": "operator",
                "type": "address",
                "internalType": "address"
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
        "name": "lastEpochClaimedProtocol",
        "inputs": [
            {
                "name": "protocolOwner",
                "type": "address",
                "internalType": "address"
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
        "name": "lastEpochClaimedStaker",
        "inputs": [
            {
                "name": "staker",
                "type": "address",
                "internalType": "address"
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
        "name": "middlewareVaultManager",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract MiddlewareVaultManager"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "minRequiredUptime",
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
        "name": "operatorBeneficiariesShares",
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
            }
        ],
        "outputs": [
            {
                "name": "share",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "operatorFee",
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
        "name": "operatorShares",
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
            }
        ],
        "outputs": [
            {
                "name": "share",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "protocolFee",
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
        "name": "protocolRewards",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "rewardsAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "renounceRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "callerConfirmation",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "revokeRole",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "internalType": "bytes32"
            },
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
        "name": "rewardsSharePerAssetClass",
        "inputs": [
            {
                "name": "assetClass",
                "type": "uint96",
                "internalType": "uint96"
            }
        ],
        "outputs": [
            {
                "name": "rewardsShare",
                "type": "uint16",
                "internalType": "uint16"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "setAdminRole",
        "inputs": [
            {
                "name": "newAdmin",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setMinRequiredUptime",
        "inputs": [
            {
                "name": "newMinUptime",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setProtocolOwner",
        "inputs": [
            {
                "name": "newProtocolOwner",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setRewardsAmountForEpochs",
        "inputs": [
            {
                "name": "startEpoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "numberOfEpochs",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "rewardsToken",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "rewardsAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "setRewardsShareForAssetClass",
        "inputs": [
            {
                "name": "assetClass",
                "type": "uint96",
                "internalType": "uint96"
            },
            {
                "name": "share",
                "type": "uint16",
                "internalType": "uint16"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "supportsInterface",
        "inputs": [
            {
                "name": "interfaceId",
                "type": "bytes4",
                "internalType": "bytes4"
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
        "name": "updateCuratorFee",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint16",
                "internalType": "uint16"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "updateOperatorFee",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint16",
                "internalType": "uint16"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "updateProtocolFee",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint16",
                "internalType": "uint16"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "uptimeTracker",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "contract UptimeTracker"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "vaultShares",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "vault",
                "type": "address",
                "internalType": "address"
            }
        ],
        "outputs": [
            {
                "name": "share",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "event",
        "name": "AdminRoleAssigned",
        "inputs": [
            {
                "name": "newAdmin",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "CuratorFeeClaimed",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "indexed": true,
                "internalType": "address"
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
        "name": "CuratorFeeUpdated",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint16",
                "indexed": false,
                "internalType": "uint16"
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
        "name": "OperatorFeeClaimed",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "indexed": true,
                "internalType": "address"
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
        "name": "OperatorFeeUpdated",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint16",
                "indexed": false,
                "internalType": "uint16"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ProtocolFeeClaimed",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "indexed": true,
                "internalType": "address"
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
        "name": "ProtocolFeeUpdated",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint16",
                "indexed": false,
                "internalType": "uint16"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ProtocolOwnerUpdated",
        "inputs": [
            {
                "name": "newProtocolOwner",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardsAmountSet",
        "inputs": [
            {
                "name": "startEpoch",
                "type": "uint48",
                "indexed": true,
                "internalType": "uint48"
            },
            {
                "name": "numberOfEpochs",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            },
            {
                "name": "rewardsToken",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "rewardsAmount",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardsClaimed",
        "inputs": [
            {
                "name": "rewardsToken",
                "type": "address",
                "indexed": true,
                "internalType": "address"
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
        "name": "RewardsDistributed",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "indexed": true,
                "internalType": "uint48"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardsShareUpdated",
        "inputs": [
            {
                "name": "assetClassId",
                "type": "uint96",
                "indexed": true,
                "internalType": "uint96"
            },
            {
                "name": "rewardsPercentage",
                "type": "uint16",
                "indexed": false,
                "internalType": "uint16"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RoleAdminChanged",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "previousAdminRole",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "newAdminRole",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RoleGranted",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "account",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "sender",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RoleRevoked",
        "inputs": [
            {
                "name": "role",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "account",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "sender",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "UndistributedRewardsClaimed",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "indexed": true,
                "internalType": "uint48"
            },
            {
                "name": "rewardsToken",
                "type": "address",
                "indexed": true,
                "internalType": "address"
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
        "name": "AddressInsufficientBalance",
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
        "name": "AssetClassNotFound",
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
        "name": "FailedInnerCall",
        "inputs": []
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
                "name": "l1Middleware",
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
        "name": "MathOverflowedMulDiv",
        "inputs": []
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
        "name": "TotalFeesExceed100",
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
