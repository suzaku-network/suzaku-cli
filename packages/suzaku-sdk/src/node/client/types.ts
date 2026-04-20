import type { SafeClient } from '@safe-global/sdk-starter-kit';
import type {
  ExtendedWalletClient as CoreExtendedWalletClient,
  ExtendedPublicClient as CoreExtendedPublicClient,
} from '../../core/client/types';

export type ExtendedWalletClient = CoreExtendedWalletClient & {
  safe?: SafeClient;
  ledger?: boolean;
};

export type ExtendedPublicClient = CoreExtendedPublicClient & {
  safe?: SafeClient;
};

export type ExtendedClient = ExtendedWalletClient | ExtendedPublicClient;
