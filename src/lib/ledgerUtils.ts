import Eth, { ledgerService } from "@ledgerhq/hw-app-eth";
import AvalancheApp from "@avalabs/hw-app-avalanche";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import { Account, toAccount } from "viem/accounts";
import { serializeTransaction, toHex, hashStruct, Hex, PublicActions, WalletClient, bytesToHex, hexToBytes } from "viem";
import { ExtendedAccount, Network, chains } from "../client";
import { logger } from "./logger";


// Singleton pour le transport Ledger avec AvalancheApp
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
    // Si une instance existe déjà, la retourner
    if (LedgerSingleton.instance) {
      return LedgerSingleton.instance;
    }

    // Si une initialisation est en cours, attendre qu'elle se termine
    if (LedgerSingleton.initPromise) {
      return LedgerSingleton.initPromise;
    }

    // Créer une nouvelle instance
    LedgerSingleton.initPromise = (async () => {
      const transport = await TransportNodeHid.create()
        .catch((error: any) => {
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
    await this.transport.close().catch(() => { });
    LedgerSingleton.instance = null;
    LedgerSingleton.initPromise = null;
  }
}

function signatureFromResult(result: any, signing_path: string) {
  if (result.returnCode && result.errorMessage && result.returnCode !== 0x9000) {
    throw new Error(result.errorMessage);
  }
  const sigBuffer = result.signatures?.get(signing_path);
  if (!sigBuffer) {
    throw new Error('No signature returned from Ledger');
  }
  // sigBuffer is 65 bytes: r (32 bytes) + s (32 bytes) + v (1 byte)
  const r = bytesToHex(sigBuffer.subarray(0, 32)).slice(2);
  const s = bytesToHex(sigBuffer.subarray(32, 64)).slice(2);
  const v = sigBuffer[64] + 27;
  const vHex = v.toString(16).padStart(2, '0');
  return `0x${r}${s}${vHex}` as Hex;
}

export async function getLedgerAccount(network: Network, accountIndex: number = 0) {

  const ledger = await LedgerSingleton.getInstance();
  const appAva = ledger.getApp();

  const { publicKey, address } = await appAva.getETHAddress(ledger.getETHPath(accountIndex), false)
    .catch((error: any) => {
      if (error.message.includes('0x6511')) {
        logger.error('Error: You should open the Avalanche app on your Ledger device');
        process.exit(1);
      }
      throw error;
    });
  const { address: pChainAddress } = await appAva.getAddressAndPubKey(ledger.getPChainPath(accountIndex), false, network === 'mainnet' ? 'avax' : 'fuji')
  return {
    pChainAddress,
    cSign: async (parameters: { hash: Hex }) => {
      const { hash } = parameters;

      const [prefixPath, signingPath] = ledger.getFragmentedETHPath(accountIndex);

      const hashBytes = Buffer.from(hexToBytes(hash))
      logger.log(`Please, confirm the hash on your Ledger device`);
      const result = await appAva.signHash(prefixPath, [signingPath], hashBytes);
      return signatureFromResult(result, signingPath);
    },
    ...toAccount({
    address: address as Hex,
    publicKey,
    async signTransaction(transaction) {
      try {
        const serializedTx = serializeTransaction(transaction);
        const resolution = await ledgerService.resolveTransaction(serializedTx.slice(2), {}, {})
        logger.log(`Please, confirm the transaction on your Ledger device`);
        const signature = await appAva.signEVMTransaction(ledger.getETHPath(accountIndex), serializedTx.slice(2), resolution).catch((error: any) => {
          if (error.message.includes('0x6986')) {
            logger.error('Error: User rejected the transaction');
            process.exit(1);
          }
          throw error;
        });

        // ECDSA signature format (r, s, v) (random, signature, recovery)
        return serializeTransaction(transaction, {
          r: `0x${signature.r}`,
          s: `0x${signature.s}`,
          v: BigInt(`0x${signature.v}`),
        });
      } catch (error) {
        logger.error(error);
        throw error;
      }
    },
    async signMessage({ message }) {
      let messageHex: string;

      if (typeof message === 'string') {
        messageHex = toHex(message);
      } else {
        messageHex = typeof message.raw === 'string'
          ? message.raw
          : toHex(message.raw);
      }

      // Remove 0x prefix if present
      if (messageHex.startsWith('0x')) {
        messageHex = messageHex.slice(2);
      }
      logger.log(`Please, confirm the message on your Ledger device`);
      const signature = await ledger.getAppEth().signPersonalMessage(ledger.getETHPath(accountIndex), messageHex);

      const r = signature.r.slice(2);
      const s = signature.s.slice(2);
      const v = signature.v + 27;
      const vHex = v.toString(16).padStart(2, '0');

      return `0x${r}${s}${vHex}` as Hex;
    },
    // Bypass EIP-193 for ledger TODO: to implement
    async sign(parameters: { hash: Hex }) {
      const { hash } = parameters;

      const [prefixPath, signingPath] = ledger.getFragmentedPChainPath(accountIndex);

      const hashBytes = Buffer.from(hexToBytes(hash))
      logger.log(`Please, confirm the hash on your Ledger device`);
      const result = await appAva.signHash(prefixPath, [signingPath], hashBytes);
      return signatureFromResult(result, signingPath);
    },
    async signTypedData(parameters: any) {
      const { domain, types, primaryType, message } = parameters;

      // Calculate Struct Hash of the message
      const structHash = hashStruct({ data: message, types, primaryType });

      // Calculate Domain Separator
      // We need to define EIP712Domain type dynamically based on what's present in 'domain' object
      const domainTypes = [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
        { name: 'salt', type: 'bytes32' },
      ].filter(key => domain?.[key.name] !== undefined);

      const domainSeparator = hashStruct({
        data: domain,
        types: { EIP712Domain: domainTypes },
        primaryType: 'EIP712Domain'
      });

      // Sign using Ledger (Blind Signing)
      // signEIP712HashedMessage expects hex strings WITHOUT 0x prefix
      const domainSepHex = domainSeparator.startsWith('0x') ? domainSeparator.slice(2) : domainSeparator;
      const structHashHex = structHash.startsWith('0x') ? structHash.slice(2) : structHash;

      try {
        logger.log(`Please, confirm the typed data on your Ledger device`);
        const signature = await appAva.signEIP712HashedMessage(ledger.getETHPath(accountIndex), domainSepHex, structHashHex);

        // EIP-712 signatures should use v=27/28.
        const v = signature.v;
        const vHex = v.toString(16);
        return `0x${signature.r}${signature.s}${vHex}` as Hex;
      } catch (error: any) {
        if (error.message.includes('0x6986')) {
          logger.error('Error: User rejected the transaction');
          process.exit(1);
        }
        throw error;
      }
    }
    })
  } as ExtendedAccount;
}

// Convert a WalletClient to a SafeProvider through the EIP-1193 interface
export async function toSafeProvider(client: WalletClient & PublicActions, account: ExtendedAccount) {
  return {
    ...client, request: async ({ method, params }: { method: any; params: any }) => {
      switch (method) {
        case 'eth_accounts':
          return [account.address.toLowerCase()];
        case 'personal_sign':
          const [message] = params;
          const result = await account.cSign!({ hash: message });
          return result;
        case 'eth_signTransaction':
          const [transaction] = params;
          return account.signTransaction!(transaction);
        case 'eth_signTypedData_v4': // Handle Typed Data signing requests from Safe SDK
          const [_, data] = params;
          const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          return account.signTypedData!(parsedData);
        case 'eth_sign': // Handle legacy signing
          const [address, dataToSign] = params;
          // eth_sign expects data to be signed. Account.signMessage handles formatting.
          return account.signMessage!({ message: { raw: dataToSign } });
        case 'eth_sendTransaction': // Handle transaction sending by signing and sending raw
          const [txParams] = params;
          const prepared = await client.prepareTransactionRequest({
            ...txParams,
            account,
            chain: client.chain,
          })
          const signedTx = await account.signTransaction!(prepared);
          return client.request({ method: 'eth_sendRawTransaction', params: [signedTx] });
        default:
          return client.request({ method, params });
      }
    }
  } as any
}


// request personal_sign[
//   '0x98835a94fe225acda56ea587c86fe1b84f3b80ca7d2ad901c41341b7f9899e83',
//   '0x67bF52e7830ACD73441A8D1425C51F5E3AcA3DcF'
// ]
// 0x98835a94fe225acda56ea587c86fe1b84f3b80ca7d2ad901c41341b7f9899e83
// 98835a94fe225acda56ea587c86fe1b84f3b80ca7d2ad901c41341b7f9899e83
// 0x688c5e6f046b48ee3485b20a18c98d9cbfb79058a72148cfee1ed1a47b4ab5823798b0d614ee0b8d5efaf831ebacf814788c95f0b20fd755a41265049f3f7c1a1b
// propose:
// 0x685B3985Ebd160fC9049D3eA320194AC11226191 {
//   to: '0x80e1D9441f7754158726450878f77515030B00fd',
//     value: '0',
//       data: '0xbcb9a217000000000000000000000000e01d5a54c0961b1001162d31ad325af6dd8509020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000044e33ab6adecb12840000',
//         operation: 0,
//           baseGas: '0',
//             gasPrice: '0',
//               gasToken: '0x0000000000000000000000000000000000000000',
//                 refundReceiver: '0x0000000000000000000000000000000000000000',
//                   nonce: 13,
//                     safeTxGas: '0'
// } 0x98835a94fe225acda56ea587c86fe1b84f3b80ca7d2ad901c41341b7f9899e83 0x67bf52e7830acd73441a8d1425c51f5e3aca3dcf 0x688c5e6f046b48ee3485b20a18c98d9cbfb79058a72148cfee1ed1a47b4ab5823798b0d614ee0b8d5efaf831ebacf814788c95f0b20fd755a41265049f3f7c1a1f

// propose:
// 0x685B3985Ebd160fC9049D3eA320194AC11226191 {
//   to: '0x80e1D9441f7754158726450878f77515030B00fd',
//     value: '0',
//       data: '0xbcb9a217000000000000000000000000e01d5a54c0961b1001162d31ad325af6dd8509020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000044e33ab6adecb12840000',
//         operation: 0,
//           baseGas: '0',
//             gasPrice: '0',
//               gasToken: '0x0000000000000000000000000000000000000000',
//                 refundReceiver: '0x0000000000000000000000000000000000000000',
//                   nonce: 13,
//                     safeTxGas: '0'
// } 0x98835a94fe225acda56ea587c86fe1b84f3b80ca7d2ad901c41341b7f9899e83 0xa2182B4697b15DD76cCa8f3ae2c823Bb63B97185 0x88b3f9ec23cb611bb6ef559cbf7a870da263318b9ebaf5e96cd9db0f610d93b653553512ccd205c0d83814797349c7f2e4693b51d2a334a4bb9c8bca25605bd01f
// setL1Limit done, tx hash: undefined
