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
        "name": "BaseDelegator__AlreadySet",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__InsufficientHookGas",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotAuthorizedMiddleware",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotInitialized",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotL1",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotSlasher",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__NotVault",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BaseDelegator__ZeroAddress",
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
        "name": "CheckpointUnorderedInsertion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidInitialization",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__DuplicateRoleHolder",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__ExceedsMaxL1Limit",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__MaxL1LimitNotSet",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__MissingRoleHolders",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1RestakeDelegator__ZeroAddressRoleHolder",
        "inputs": []
    },
    {
        "type": "error",
        "name": "NotInitializing",
        "inputs": []
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
        "name": "Vault__NotSlasher",
        "inputs": []
    }
] as const;

export type TL1RestakeDelegatorErrors = typeof errors;
export default errors;
