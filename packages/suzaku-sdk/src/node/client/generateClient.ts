import { createSafeClient } from '@safe-global/sdk-starter-kit';
import { type Hex } from 'viem';
import { privateKeyToAvalancheAccount } from '@avalanche-sdk/client/accounts';
import { chainList } from '../../core/client/chainList';
import { createAvalanchePublicExtendedClient } from '../../core/client/createAvalanchePublicExtendedClient';
import { type Chains, type Network, type PChainAddress } from '../../core/client/types';
import { type ExtendedWalletClient, type ExtendedPublicClient, type ExtendedClient } from './types';
import { getLedgerAccount, toSafeProvider } from './ledgerUtils';
import { logger } from '../../core/logger/index';

type ClientOptions = { wait?: number; skipAbiValidation?: boolean };

export async function generateClient(chain: Chains, privateKey: Hex | 'ledger', safe?: Hex, options?: ClientOptions): Promise<ExtendedWalletClient>;
export async function generateClient(chain: Chains, privateKey?: undefined, safe?: Hex, options?: ClientOptions): Promise<ExtendedPublicClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger', safe?: Hex, options?: ClientOptions): Promise<ExtendedClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger', safe?: Hex, options?: ClientOptions): Promise<ExtendedClient> {
  const network: Network = chainList[chain].testnet ? 'fuji' : 'mainnet';

  if (network !== chain && safe) {
    logger.error(`Error: The chain ${chain} is not supported by safe on the ${network} network`);
    process.exit(1);
  }

  const isLedger = privateKey === 'ledger';

  if (privateKey) {
    const avalancheAccount = isLedger
      ? await getLedgerAccount(network, process.env.LEDGER_ACCOUNT_INDEX ? parseInt(process.env.LEDGER_ACCOUNT_INDEX) : 0)
      : privateKeyToAvalancheAccount(privateKey);

    const hrp = network === 'mainnet' ? 'avax' : 'fuji';
    const pChainAddress = avalancheAccount.getXPAddress('P', hrp) as PChainAddress;
    const cChainAddress = avalancheAccount.getEVMAddress() as Hex;
    const baseUrl = chainList[chain].rpcUrls.default.http[0];

    const walletClient = createAvalanchePublicExtendedClient(
      baseUrl,
      chainList[chain],
      network,
      cChainAddress,
      pChainAddress,
      avalancheAccount,
    );

    const safeClient = safe
      ? await createSafeClient({
          provider: isLedger ? await toSafeProvider(walletClient as any, avalancheAccount) : baseUrl,
          signer: isLedger ? undefined : privateKey,
          safeAddress: safe,
          txServiceUrl:
            network === 'fuji' ? 'https://wallet-transaction-fuji.ash.center/api' : 'https://api.safe.global/tx-service/avax/api',
          apiKey: network === 'fuji' ? undefined : process.env.SAFE_API_KEY,
        })
      : undefined;

    return {
      ...walletClient,
      ledger: isLedger,
      safe: safeClient,
      ...options,
    } as ExtendedWalletClient;
  }

  const baseUrl = chainList[chain].rpcUrls.default.http[0];
  const publicClient = createAvalanchePublicExtendedClient(baseUrl, chainList[chain], network);

  const safeClient = safe
    ? await createSafeClient({
        provider: baseUrl,
        safeAddress: safe,
        txServiceUrl:
          network === 'fuji' ? 'https://wallet-transaction-fuji.ash.center/api' : 'https://api.safe.global/tx-service/avax/api',
        apiKey: network === 'fuji' ? undefined : process.env.SAFE_API_KEY,
      })
    : undefined;

  return {
    ...publicClient,
    safe: safeClient,
    ...options,
  } as ExtendedPublicClient;
}
