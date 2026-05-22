const errors = [
    {
        "type": "error",
        "name": "CheckpointUnorderedInsertion",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidShortString",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__AlreadyOptedIn",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__ExpiredSignature",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__InvalidSignature",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotOptedIn",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotWhereEntity",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotWhereRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__NotWho",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OptInService__OptOutCooldown",
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
        "name": "StringTooLong",
        "inputs": [
            {
                "name": "str",
                "type": "string",
                "internalType": "string"
            }
        ]
    }
] as const;

export type TOperatorVaultOptInServiceErrors = typeof errors;
export default errors;
