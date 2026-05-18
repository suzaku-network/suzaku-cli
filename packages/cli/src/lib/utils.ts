export { cb58ToBytes, cb58ToHex, bytesToCB58, parseNodeID, encodeNodeID, isValidPrivateKey, unpackGeneric, bytes32ToAddress, bigintReplacer } from '@suzaku-network/suzaku-sdk/core';
export type { NodeId } from '@suzaku-network/suzaku-sdk/core';
export { getAddresses, getCchainAddress, retryWhileError } from '@suzaku-network/suzaku-sdk/node';

import { spawnSync } from 'child_process';

export function getClipboardValue(): string {
    let result: string;
    const platform = process.platform;

    if (platform === 'win32') {
        result = spawnSync('powershell', ['-command', 'Get-Clipboard'], { encoding: 'utf-8', shell: false }).stdout;
    } else if (platform === 'darwin') {
        result = spawnSync('pbpaste', [], { encoding: 'utf-8', shell: false }).stdout;
    } else {
        result = spawnSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf-8', shell: false }).stdout;
    }

    return result.trim();
}

export function setClipboardValue(value: string): void {
    const platform = process.platform;

    if (platform === 'win32') {
        spawnSync('powershell', ['-command', `Set-Clipboard -Value "${value.replace(/"/g, '""')}"`], { encoding: 'utf-8', shell: false });
    } else if (platform === 'darwin') {
        spawnSync('pbcopy', [], { input: value, encoding: 'utf-8', shell: false });
    } else {
        spawnSync('echo ' + value + ' | xclip -selection clipboard', { encoding: 'utf-8', shell: false });
    }
}
