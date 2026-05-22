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
        "name": "MiddlewareVaultManager__NotVault",
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
        "name": "MiddlewareVaultManager__SlasherNotImplemented",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MiddlewareVaultManager__VaultAlreadyRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MiddlewareVaultManager__VaultEpochTooShort",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MiddlewareVaultManager__VaultGracePeriodNotPassed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MiddlewareVaultManager__VaultNotDisabled",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MiddlewareVaultManager__WrongVaultCollateralClass",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MiddlewareVaultManager__ZeroAddress",
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
        "name": "MiddlewareVaultManager__ZeroVaultMaxL1Limit",
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

export type TVaultManagerErrors = typeof errors;
export default errors;
