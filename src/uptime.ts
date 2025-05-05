import { packValidationUptimeMessage, collectSignatures } from "./lib/warpUtils";
import { bytesToHex } from '@noble/hashes/utils';

export async function getValidationUptimeMessage(
    rpcUrl: string,
    nodeId: string,
    networkID: number,
    sourceChainID: string,
) {
    // Perform a POST request to rpcUrl/validators, payload is {jsonrpc: "2.0", method: "validators.getCurrentValidators", params: { nodeIDs: [...] }, id: 1}
    const response = await fetch(rpcUrl + "/validators", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "validators.getCurrentValidators",
            params: {
                nodeIDs: [nodeId],
            },
            id: 1,
        }),
    });
    const data = await response.json();

    const validationID = data.result.validators[0].validationID;
    const uptimeSeconds = data.result.validators[0].uptimeSeconds;

    const unsignedValidationUptimeMessage = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, sourceChainID);
    const unsignedValidationUptimeMessageHex = bytesToHex(unsignedValidationUptimeMessage);
    console.log("Unsigned Validation Uptime Message: ", unsignedValidationUptimeMessageHex);

    const signedValidationUptimeMessage = await collectSignatures(unsignedValidationUptimeMessageHex);
    console.log("Signed Validation Uptime Message: ", signedValidationUptimeMessage);

    return signedValidationUptimeMessage;
}
