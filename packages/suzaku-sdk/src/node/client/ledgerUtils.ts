import Eth, { ledgerService } from '@ledgerhq/hw-app-eth';
import AvalancheApp from '@avalabs/hw-app-avalanche';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import { toAccount } from 'viem/accounts';
import { serializeTransaction, toHex, hashStruct, type Hex, type PublicActions, type WalletClient, bytesToHex, hexToBytes } from 'viem';
import { type AvalancheAccount, type XPAccount } from '@avalanche-sdk/client/accounts';
import { logger } from '../../core/logger/index';
import type { Network } from '../../core/client/types';

class LedgerSingleton {
  private static instance: LedgerSingleton | null = null;
  private static initPromise: Promise<LedgerSingleton> | null = null;

  private transport: Awaited<ReturnType<typeof TransportNodeHid.create>>;
  private appAva: AvalancheApp;

  private constructor(transport: Awaited<ReturnType<typeof TransportNodeHid.create>>, appAva: AvalancheApp) {
    this.transport = transport;
    this.appAva = appAva;
  }

  static async getInstance(): Promise<LedgerSingleton> {
    if (LedgerSingleton.instance) return LedgerSingleton.instance;
    if (LedgerSingleton.initPromise) return LedgerSingleton.initPromise;

    LedgerSingleton.initPromise = (async () => {
      let transport: any;
      setTimeout(() => {
        if (!transport) {
          logger.error('Error: Ledger timeout. Please make sure your Ledger device is connected and unlocked.');
          process.exit(1);
        }
      }, 2000);
      transport = await TransportNodeHid.create().catch((error: any) => {
        if (error.message.includes('cannot open device with path')) {
          logger.error('Error: You should probably use `suzaku-cli ledger fix-usb-rules` to be able to use Ledger devices on Linux');
          process.exit(1);
        }
        throw error;
      });

      const appAva = new AvalancheApp(transport);
      LedgerSingleton.instance = new LedgerSingleton(transport, appAva);
      return LedgerSingleton.instance;
    })();

    return LedgerSingleton.initPromise;
  }

  getApp(): AvalancheApp {
    return this.appAva;
  }

  getAppEth(): Eth {
    // @ts-ignore
    return this.appAva.eth;
  }

  getFragmentedETHPath(accountIndex: number): string[] {
    return [`m/44'/60'/${accountIndex}'`, `0/0`];
  }

  getFragmentedPChainPath(accountIndex: number): string[] {
    return [`m/44'/9000'/${accountIndex}'`, `0/0`];
  }

  getETHPath(accountIndex: number): string {
    return `m/44'/60'/${accountIndex}'/0/0`;
  }

  getPChainPath(accountIndex: number): string {
    return `m/44'/9000'/${accountIndex}'/0/0`;
  }

  async close(): Promise<void> {
    await this.transport.close().catch(() => {});
    LedgerSingleton.instance = null;
    LedgerSingleton.initPromise = null;
  }
}

function signatureFromResult(result: any, signing_path: string): Hex {
  if (result.returnCode && result.errorMessage && result.returnCode !== 0x9000) {
    throw new Error(result.errorMessage);
  }
  const sigBuffer = result.signatures?.get(signing_path);
  if (!sigBuffer) {
    throw new Error('No signature returned from Ledger');
  }
  const r = bytesToHex(sigBuffer.subarray(0, 32)).slice(2);
  const s = bytesToHex(sigBuffer.subarray(32, 64)).slice(2);
  const v = sigBuffer[64] + 27;
  return `0x${r}${s}${v.toString(16).padStart(2, '0')}` as Hex;
}

/**
 * Creates an AvalancheAccount backed by a Ledger hardware wallet.
 * - evmAccount: signs EVM transactions and messages via the ETH derivation path
 * - xpAccount: signs P/X-chain transactions via the P-chain derivation path
 */
export async function getLedgerAccount(network: Network, accountIndex: number = 0): Promise<AvalancheAccount> {
  const ledger = await LedgerSingleton.getInstance();
  const appAva = ledger.getApp();
  const { publicKey, address } = await appAva.getETHAddress(ledger.getETHPath(accountIndex), false).catch((error: any) => {
    if (error.message.includes('0x6511')) {
      logger.error('Error: You should open the Avalanche app on your Ledger device');
      process.exit(1);
    }
    throw error;
  });

  const hrp = network === 'mainnet' ? 'avax' : 'fuji';
  const { address: pChainAddressRaw } = await appAva.getAddressAndPubKey(ledger.getPChainPath(accountIndex), false, hrp);
  const pChainAddress = pChainAddressRaw.startsWith('P-') ? pChainAddressRaw : `P-${pChainAddressRaw}`;

  const evmAccount = toAccount({
    address: address as Hex,
    publicKey,

    async sign({ hash }: { hash: Hex }) {
      const [prefixPath, signingPath] = ledger.getFragmentedETHPath(accountIndex);
      const hashBytes = Buffer.from(hexToBytes(hash));
      logger.log('Please confirm the hash on your Ledger device');
      const result = await appAva.signHash(prefixPath, [signingPath], hashBytes);
      return signatureFromResult(result, signingPath);
    },

    async signTransaction(transaction) {
      const serializedTx = serializeTransaction(transaction);
      const resolution = await ledgerService.resolveTransaction(serializedTx.slice(2), {}, {});
      logger.log('Please confirm the transaction on your Ledger device');
      const signature = await appAva.signEVMTransaction(ledger.getETHPath(accountIndex), serializedTx.slice(2), resolution).catch((error: any) => {
        if (error.message.includes('0x6986')) {
          logger.error('Error: User rejected the transaction');
          process.exit(1);
        }
        throw error;
      });
      return serializeTransaction(transaction, {
        r: `0x${signature.r}`,
        s: `0x${signature.s}`,
        v: BigInt(`0x${signature.v}`),
      });
    },

    async signMessage({ message }) {
      let messageHex: string;
      if (typeof message === 'string') {
        messageHex = toHex(message);
      } else {
        messageHex = typeof message.raw === 'string' ? message.raw : toHex(message.raw);
      }
      if (messageHex.startsWith('0x')) messageHex = messageHex.slice(2);
      logger.log('Please confirm the message on your Ledger device');
      const signature = await ledger.getAppEth().signPersonalMessage(ledger.getETHPath(accountIndex), messageHex);
      const r = signature.r.slice(2);
      const s = signature.s.slice(2);
      const v = signature.v + 27;
      return `0x${r}${s}${v.toString(16).padStart(2, '0')}` as Hex;
    },

    async signTypedData({ domain, types, primaryType, message }: any) {
      const structHash = hashStruct({ data: message, types, primaryType });
      const domainTypes = [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
        { name: 'salt', type: 'bytes32' },
      ].filter((key) => domain?.[key.name] !== undefined);
      const domainSeparator = hashStruct({
        data: domain,
        types: { EIP712Domain: domainTypes },
        primaryType: 'EIP712Domain',
      });
      const domainSepHex = domainSeparator.startsWith('0x') ? domainSeparator.slice(2) : domainSeparator;
      const structHashHex = structHash.startsWith('0x') ? structHash.slice(2) : structHash;
      logger.log('Please confirm the typed data on your Ledger device');
      const signature = await appAva.signEIP712HashedMessage(ledger.getETHPath(accountIndex), domainSepHex, structHashHex).catch((error: any) => {
        if (error.message.includes('0x6986')) {
          logger.error('Error: User rejected the transaction');
          process.exit(1);
        }
        throw error;
      });
      return `0x${signature.r}${signature.s}${signature.v.toString(16)}` as Hex;
    },
  });

  const xpAccount: XPAccount = {
    publicKey,
    signMessage: async (message: string) => {
      const hash = message.startsWith('0x') ? (message as Hex) : (`0x${message}` as Hex);
      const [prefixPath, signingPath] = ledger.getFragmentedPChainPath(accountIndex);
      const hashBytes = Buffer.from(hexToBytes(hash));
      logger.log('Please confirm the hash on your Ledger device');
      const result = await appAva.signHash(prefixPath, [signingPath], hashBytes);
      return signatureFromResult(result, signingPath);
    },
    signTransaction: async (txHash: string | Uint8Array) => {
      const hex = typeof txHash === 'string' ? txHash : bytesToHex(txHash);
      const hash = hex.startsWith('0x') ? (hex as Hex) : (`0x${hex}` as Hex);
      const [prefixPath, signingPath] = ledger.getFragmentedPChainPath(accountIndex);
      const hashBytes = Buffer.from(hexToBytes(hash));
      logger.log('Please confirm the P-chain transaction on your Ledger device');
      const result = await appAva.signHash(prefixPath, [signingPath], hashBytes);
      return signatureFromResult(result, signingPath);
    },
    verify: (_message: string, _signature: string) => false,
    type: 'local' as const,
    source: 'privateKey' as const,
  };

  return {
    evmAccount,
    xpAccount,
    getXPAddress: (chain?: 'X' | 'P' | 'C', _hrp?: string) => {
      if (chain === 'P') return pChainAddress;
      return pChainAddressRaw;
    },
    getEVMAddress: () => address as Hex,
  };
}

/**
 * Wraps a wallet client into an EIP-1193 provider for Safe SDK, forwarding
 * signing requests to the Ledger via the AvalancheAccount's evmAccount.
 */
export async function toSafeProvider(client: WalletClient & PublicActions, account: AvalancheAccount) {
  return {
    ...client,
    request: async ({ method, params }: { method: any; params: any }) => {
      switch (method) {
        case 'eth_accounts':
          return [account.getEVMAddress().toLowerCase()];
        case 'personal_sign': {
          const [message] = params;
          return account.evmAccount.sign!({ hash: message });
        }
        case 'eth_signTransaction': {
          const [transaction] = params;
          return account.evmAccount.signTransaction!(transaction);
        }
        case 'eth_signTypedData_v4': {
          const [, data] = params;
          const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          return account.evmAccount.signTypedData!(parsedData);
        }
        case 'eth_sign': {
          const [, dataToSign] = params;
          return account.evmAccount.signMessage!({ message: { raw: dataToSign } });
        }
        case 'eth_sendTransaction': {
          const [txParams] = params;
          const prepared = await client.prepareTransactionRequest({
            ...txParams,
            account: account.evmAccount,
            chain: client.chain,
          });
          const signedTx = await account.evmAccount.signTransaction!(prepared);
          return client.request({ method: 'eth_sendRawTransaction', params: [signedTx] });
        }
        default:
          return client.request({ method, params });
      }
    },
  } as any;
}
