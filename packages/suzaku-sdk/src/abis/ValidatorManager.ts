export const ValidatorManagerABI = [
    {
        "type": "event",
        "name": "InitiatedValidatorRegistration",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "nodeID",
                "type": "bytes20",
                "indexed": true,
                "internalType": "bytes20"
            },
            {
                "name": "registrationMessageID",
                "type": "bytes32",
                "indexed": false,
                "internalType": "bytes32"
            },
            {
                "name": "registrationExpiry",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "weight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
    },
    {
        "type": "function",
        "name": "subnetID",
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
        "name": "completeValidatorRegistration",
        "inputs": [
            {
                "name": "messageIndex",
                "type": "uint32",
                "internalType": "uint32"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "InitiatedValidatorRemoval",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "validatorWeightMessageID",
                "type": "bytes32",
                "indexed": false,
                "internalType": "bytes32"
            },
            {
                "name": "weight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "endTime",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "CompletedValidatorRemoval",
        "inputs": [
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
        "type": "function",
        "name": "getNodeValidationID",
        "inputs": [
            {
                "name": "nodeID",
                "type": "bytes",
                "internalType": "bytes"
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
        "name": "getValidator",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "internalType": "struct Validator",
                "components": [
                    {
                        "name": "status",
                        "type": "uint8",
                        "internalType": "enum ValidatorStatus"
                    },
                    {
                        "name": "nodeID",
                        "type": "bytes",
                        "internalType": "bytes"
                    },
                    {
                        "name": "startingWeight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "sentNonce",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "receivedNonce",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "weight",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "startTime",
                        "type": "uint64",
                        "internalType": "uint64"
                    },
                    {
                        "name": "endTime",
                        "type": "uint64",
                        "internalType": "uint64"
                    }
                ]
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "initiateValidatorRemoval",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
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
        "outputs": [
            {
                "name": "",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "InitiatedValidatorWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "indexed": true,
                "internalType": "bytes32"
            },
            {
                "name": "nonce",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            },
            {
                "name": "weightUpdateMessageID",
                "type": "bytes32",
                "indexed": false,
                "internalType": "bytes32"
            },
            {
                "name": "weight",
                "type": "uint64",
                "indexed": false,
                "internalType": "uint64"
            }
        ],
        "anonymous": false
    },
] as const
