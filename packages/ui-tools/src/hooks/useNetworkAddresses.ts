'use client';

import { useChainId } from 'wagmi';
import { NETWORK_ADDRESSES } from '@suzaku-network/suzaku-sdk/core';
import type { NetworkAddresses } from '@suzaku-network/suzaku-sdk/core';

export function useNetworkAddresses(): NetworkAddresses {
  const chainId = useChainId();
  return NETWORK_ADDRESSES[chainId] ?? {};
}
