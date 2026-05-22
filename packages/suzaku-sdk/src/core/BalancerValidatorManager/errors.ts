import ValidatorManagerErrors from '../ValidatorManager/errors';

const ownErrors = [
    {
        "type": "error",
        "name": "BalancerValidatorManager__CannotRemoveModuleWithAssignedValidators",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "remainingValidators",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__CannotRemoveModuleWithWeight",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__InconsistentNonce",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__InitialSecurityModuleMaxWeightLowerThanTotalWeight",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "initialMaxWeight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "totalWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__InitialSecurityModuleRequiredForMigration",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__InvalidNonce",
        "inputs": [
            {
                "name": "nonce",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__InvalidValidatorStatus",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "status",
                "type": "uint8",
                "internalType": "enum ValidatorStatus"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__InvalidValidatorWeight",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__InvalidWarpMessage",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__MigratedNodeIDNotFound",
        "inputs": [
            {
                "name": "nodeID",
                "type": "bytes",
                "internalType": "bytes"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__MigratedValidatorsRequired",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__MigratedValidatorsTotalWeightMismatch",
        "inputs": [
            {
                "name": "migratedValidatorsTotalWeight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "currentL1TotalWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__NewWeightIsZero",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__NoPendingWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__PendingWeightUpdate",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__SecurityModuleMaxWeightExceeded",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "weight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "maxWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__SecurityModuleNewMaxWeightLowerThanCurrentWeight",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            },
            {
                "name": "newMaxWeight",
                "type": "uint64",
                "internalType": "uint64"
            },
            {
                "name": "currentWeight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__SecurityModuleNotRegistered",
        "inputs": [
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__VMValidatorSetNotInitialized",
        "inputs": []
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__ValidatorAlreadyMigrated",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__ValidatorNotBelongingToSecurityModule",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "securityModule",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "BalancerValidatorManager__ZeroValidatorManagerAddress",
        "inputs": []
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
        "name": "InvalidBLSKeyLength",
        "inputs": [
            {
                "name": "length",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidChurnPeriodLength",
        "inputs": [
            {
                "name": "churnPeriodLength",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidConversionID",
        "inputs": [
            {
                "name": "encodedConversionID",
                "type": "bytes32",
                "internalType": "bytes32"
            },
            {
                "name": "expectedConversionID",
                "type": "bytes32",
                "internalType": "bytes32"
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
        "name": "InvalidInitializationStatus",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidMaximumChurnPercentage",
        "inputs": [
            {
                "name": "maximumChurnPercentage",
                "type": "uint8",
                "internalType": "uint8"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidNodeID",
        "inputs": [
            {
                "name": "nodeID",
                "type": "bytes",
                "internalType": "bytes"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidNonce",
        "inputs": [
            {
                "name": "nonce",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidPChainOwnerAddresses",
        "inputs": []
    },
    {
        "type": "error",
        "name": "InvalidPChainOwnerThreshold",
        "inputs": [
            {
                "name": "threshold",
                "type": "uint256",
                "internalType": "uint256"
            },
            {
                "name": "addressesLength",
                "type": "uint256",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidTotalWeight",
        "inputs": [
            {
                "name": "weight",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidationID",
        "inputs": [
            {
                "name": "validationID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidatorManagerAddress",
        "inputs": [
            {
                "name": "validatorManagerAddress",
                "type": "address",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidatorManagerBlockchainID",
        "inputs": [
            {
                "name": "blockchainID",
                "type": "bytes32",
                "internalType": "bytes32"
            }
        ]
    },
    {
        "type": "error",
        "name": "InvalidValidatorStatus",
        "inputs": [
            {
                "name": "status",
                "type": "uint8",
                "internalType": "enum ValidatorStatus"
            }
        ]
    },
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
        "name": "MaxChurnRateExceeded",
        "inputs": [
            {
                "name": "churnAmount",
                "type": "uint64",
                "internalType": "uint64"
            }
        ]
    },
    {
        "type": "error",
        "name": "NodeAlreadyRegistered",
        "inputs": [
            {
                "name": "nodeID",
                "type": "bytes",
                "internalType": "bytes"
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
        "name": "UnexpectedRegistrationStatus",
        "inputs": [
            {
                "name": "validRegistration",
                "type": "bool",
                "internalType": "bool"
            }
        ]
    },
    {
        "type": "error",
        "name": "ZeroAddress",
        "inputs": []
    }
] as const;
const errors = [...ownErrors, ...ValidatorManagerErrors] as const;

export type TBalancerValidatorManagerErrors = typeof errors;
export default errors;
