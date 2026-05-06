import { type Address, type Abi, type AbiFunction, type Hex } from 'viem';
import { logger } from '../logger/index';

let _castMode = false;
export function setCastMode(enabled: boolean) { _castMode = enabled; }
export function isCastMode() { return _castMode; }

export const CAST_DUMMY_HASH = '0xca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57' as Hex;

export interface CastCommandOptions {
    value?: bigint;
    accessList?: { address: string; storageKeys: string[] }[];
}

// ── Private helpers ───────────────────────────────────────────────────────────

function formatCastArg(value: unknown): string {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return value.toString();
    if (Array.isArray(value)) return `"[${value.map(formatCastArg).join(',')}]"`;
    if (value === undefined || value === null) return '0';
    return String(value);
}

function getSignature(abi: Abi, functionName: string): string {
    const fn = abi.find((item): item is AbiFunction => item.type === 'function' && item.name === functionName);
    if (!fn) return functionName;
    const inputs = fn.inputs.map((i) => i.type).join(',');
    const outputs = fn.outputs?.map((o) => o.type).join(',');
    const sig = `${fn.name}(${inputs})`;
    return outputs ? `${sig}(${outputs})` : sig;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function formatCastCommand(
    mode: 'call' | 'send',
    address: Address,
    abi: Abi,
    functionName: string,
    args: unknown[] | undefined,
    rpcUrl: string | undefined,
    options?: CastCommandOptions,
): string {
    const sig = getSignature(abi, functionName);
    const formattedArgs = (args ?? []).map(formatCastArg).join(' ');
    let cmd = `cast ${mode} ${address} "${sig}"`;
    if (formattedArgs) cmd += ` ${formattedArgs}`;
    if (options?.value) cmd += ` --value ${options.value}`;
    if (options?.accessList && options.accessList.length > 0) {
        cmd += ` --access-list '${JSON.stringify(options.accessList)}'`;
    }
    if (rpcUrl) cmd += ` --rpc-url ${rpcUrl}`;
    if (mode === 'send') cmd += ` --private-key $PK`;
    return cmd;
}

export function logCastCall(
    _contractName: string,
    address: Address,
    abi: Abi,
    functionName: string,
    args: unknown[] | undefined,
    rpcUrl: string | undefined,
) {
    logger.log(`\n${formatCastCommand('call', address, abi, functionName, args, rpcUrl)}\n`);
}

export function logCastSend(
    _contractName: string,
    address: Address,
    abi: Abi,
    functionName: string,
    args: unknown[] | undefined,
    rpcUrl: string | undefined,
    options?: CastCommandOptions,
) {
    logger.log(`\n${formatCastCommand('send', address, abi, functionName, args, rpcUrl, options)}\n`);
}

export function logPChainIssueTx(signedTxHex: Hex, rpcUrl: string): Hex {
    const endpoint = rpcUrl.replace('C/rpc', 'P');
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'platform.issueTx', params: { tx: signedTxHex, encoding: 'hex' } });
    logger.log(`\ncurl -X POST -H "Content-Type: application/json" -d '${body}' ${endpoint}\n`);
    return CAST_DUMMY_HASH;
}
