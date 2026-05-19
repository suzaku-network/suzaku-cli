'use client';

import { useGetAllL1s } from '@suzaku-network/suzaku-sdk/react';
import { useNetworkAddresses } from '@/hooks/useNetworkAddresses';
import { L1Card } from './L1Card';
import { Skeleton } from './ui/skeleton';

export function L1RegistryCarousel() {
  const { L1_REGISTRY } = useNetworkAddresses();
  const { data: l1s, isLoading, error } = useGetAllL1s({ l1RegistryAddress: L1_REGISTRY });

  if (error) {
    return <p className="text-sm text-destructive">Failed to load L1s: {error.message}</p>;
  }

  return (
    <div className="relative">
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-56 shrink-0 rounded-xl" />
            ))
          : (l1s ?? []).map((l1) => <L1Card key={l1.address} l1={l1} />)}
        {!isLoading && l1s?.length === 0 && (
          <p className="text-sm text-muted-foreground">No L1s registered.</p>
        )}
      </div>
    </div>
  );
}
