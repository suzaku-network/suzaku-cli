import { InfoApi } from "@avalabs/avalanchejs/dist/info";

export async function getNodeID(rpcUrl: string) {
    const infoAPI = new InfoApi(rpcUrl);
    return await infoAPI.getNodeId();
}
