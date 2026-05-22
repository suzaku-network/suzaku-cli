const errors = [
    {
        "type": "error",
        "name": "EntityNotExist",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__AlreadyBlacklisted",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__AlreadyWhitelisted",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__InvalidImplementation",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__InvalidVersion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__NotOwner",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__OldVersion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "MigratableFactory__VersionBlacklisted",
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
    }
] as const;

export type TVaultFactoryErrors = typeof errors;
export default errors;
