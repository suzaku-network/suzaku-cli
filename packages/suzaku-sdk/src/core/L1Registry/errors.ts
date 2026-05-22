const errors = [
    {
        "type": "error",
        "name": "L1Registry__FeeExceedsMaximum",
        "inputs": [
            {
                "name": "newFee",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "maxFee",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__FeeTransferFailed",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__InsufficientFee",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__InvalidL1Middleware",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__InvalidValidatorManager",
        "inputs": [
            {
                "name": "l1",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__L1AlreadyRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__L1NotRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__NoFeesToWithdraw",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__NotFeeCollector",
        "inputs": [
            {
                "name": "caller",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__NotValidatorManagerOwner",
        "inputs": [
            {
                "name": "caller",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "expectedOwner",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__RefundFailed",
        "inputs": [
            {
                "name": "refundAmount",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "L1Registry__UnexpectedEther",
        "inputs": []
    },
    {
        "type": "error",
        "name": "L1Registry__ZeroAddress",
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

export type TL1RegistryErrors = typeof errors;
export default errors;
