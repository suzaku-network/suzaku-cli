const errors = [
    {
        "type": "error",
        "name": "OperatorRegistry__OperatorAlreadyRegistered",
        "inputs": []
    },
    {
        "type": "error",
        "name": "OperatorRegistry__OperatorNotRegistered",
        "inputs": []
    }
] as const;

export type TOperatorRegistryErrors = typeof errors;
export default errors;
