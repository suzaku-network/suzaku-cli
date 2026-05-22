const errors = [
    {
        "type": "error",
        "name": "InvalidWarpMessage",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidWarpOriginSenderAddress",
        "inputs": [
            {
                "name": "senderAddress",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidWarpSourceChainID",
        "inputs": [
            {
                "name": "sourceChainID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "UptimeBeforeStart",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "startEpoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "currentEpoch",
                "type": "uint48",
                "internalType": "uint48"
            }
        ]
    },
    {
        "type": "error",
        "name": "UptimeTracker__NoValidators",
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
        "name": "UptimeTracker__OperatorUptimeAlreadySet",
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
        ]
    },
    {
        "type": "error",
        "name": "UptimeTracker__ValidatorUptimeNotRecorded",
        "inputs": [
            {
                "name": "epoch",
                "type": "uint48",
                "internalType": "uint48"
            },
            {
                "name": "validator",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    }
] as const;

export type TUptimeTrackerErrors = typeof errors;
export default errors;
