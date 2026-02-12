import { Address, Abi, AbiFunction, Hex } from 'viem';
import { color } from 'console-log-colors';
import { logger } from './logger';

// ── Cast mode ────────────────────────────────────────────────────────
let _castMode = false;
export function setCastMode(enabled: boolean) { _castMode = enabled; }
export function isCastMode() { return _castMode; }

export const CAST_DUMMY_HASH = "0xca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57ca57" as Hex;

function formatCastArg(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  if (Array.isArray(value)) return `"[${value.map(formatCastArg).join(',')}]"`;
  if (value === undefined || value === null) return '0';
  return String(value);
}

function getSignature(abi: Abi, functionName: string): string {
  const fn = abi.find(
    (item): item is AbiFunction => item.type === 'function' && item.name === functionName,
  );
  if (!fn) return functionName;
  const inputs = fn.inputs.map((i) => i.type).join(',');
  const outputs = fn.outputs?.map((o) => o.type).join(',');
  const sig = `${fn.name}(${inputs})`;
  return outputs ? `${sig}(${outputs})` : sig;
}

export interface CastCommandOptions {
  value?: bigint;
  accessList?: { address: string; storageKeys: string[] }[];
}

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

/** Log a `cast call` command (read) */
export function logCastCall(
  contractName: string,
  address: Address,
  abi: Abi,
  functionName: string,
  args: unknown[] | undefined,
  rpcUrl: string | undefined,
) {
  const cmd = formatCastCommand('call', address, abi, functionName, args, rpcUrl);
  logger.log(color.dim(`\n${cmd}\n`));
  logger.addData('cast', { mode: 'call', contract: contractName, function: functionName, address, args, cmd });
}

/** Log a `cast send` command (write) */
export function logCastSend(
  contractName: string,
  address: Address,
  abi: Abi,
  functionName: string,
  args: unknown[] | undefined,
  rpcUrl: string | undefined,
  options?: CastCommandOptions,
) {
  const cmd = formatCastCommand('send', address, abi, functionName, args, rpcUrl, options);
  logger.log(color.cyan(`\n${cmd}\n`));
  logger.addData('cast', { mode: 'send', contract: contractName, function: functionName, address, args, cmd });
}

/** Log a `curl` command for a P-Chain signed transaction and return a dummy tx hash. */
export function logPChainIssueTx(signedTxBytes: Uint8Array, rpcUrl: string): Hex {
  const signedTxHex = '0x' + Buffer.from(signedTxBytes).toString('hex');
  const endpoint = rpcUrl.replace('C/rpc', 'P');
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'platform.issueTx',
    params: { tx: signedTxHex, encoding: 'hex' },
  });
  const cmd = `curl -X POST -H "Content-Type: application/json" -d '${body}' ${endpoint}`;
  logger.log(color.cyan(`\n${cmd}\n`));
  logger.addData('cast', { mode: 'p-chain', function: 'platform.issueTx', cmd });
  return CAST_DUMMY_HASH;
}
