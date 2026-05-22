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
        "name": "AlreadyInitialized",
        "inputs": []
    },
    {
        "type": "error",
        "name": "CheckpointUnorderedInsertion",
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
        "name": "InvalidInitialization",
        "inputs": []
    },
    {
        "type": "error",
        "name": "NotFactory",
        "inputs": []
    },
    {
        "type": "error",
        "name": "NotInitialized",
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
        "name": "Vault__AlreadyClaimed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__AlreadySet",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__DelegatorAlreadyInitialized",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__DepositLimitReached",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InconsistentRoles",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InsufficientClaim",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InsufficientDeposit",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InsufficientRedemption",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InsufficientWithdrawal",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidAccount",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidBurner",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidCaptureEpoch",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidClaimer",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidCollateral",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidDelegator",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidEpoch",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidEpochDuration",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidFactory",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidLengthEpochs",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidOnBehalfOf",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidRecipient",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidSlasher",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__InvalidTimestamp",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__MigrationNotImplemented",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__MissingRoles",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__NoPreviousEpoch",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__NotDelegator",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__NotSlasher",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__NotWhitelistedDepositor",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__SlasherAlreadyInitialized",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__TooMuchRedeem",
        "inputs": []
    },
    {
        "type": "error",
        "name": "Vault__TooMuchWithdraw",
        "inputs": []
    }
] as const;

export type TVaultTokenizedErrors = typeof errors;
export default errors;
