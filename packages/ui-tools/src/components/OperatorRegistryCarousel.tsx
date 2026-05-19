'use client';

import { useGetAllOperators } from '@suzaku-network/suzaku-sdk/react';
import { useNetworkAddresses } from '@/hooks/useNetworkAddresses';
import { OperatorCard } from './OperatorCard';
import { Skeleton } from './ui/skeleton';

export function OperatorRegistryCarousel() {
  const { OPERATOR_REGISTRY } = useNetworkAddresses();
  const { data: operators, isLoading, error } = useGetAllOperators({ operatorRegistryAddress: OPERATOR_REGISTRY });

  if (error) {
    return <p className="text-sm text-destructive">Failed to load operators: {error.message}</p>;
  }

  return (
    <div className="relative">
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-56 shrink-0 rounded-xl" />
            ))
          : (operators ?? []).map((op) => <OperatorCard key={op.address} operator={op} />)}
        {!isLoading && operators?.length === 0 && (
          <p className="text-sm text-muted-foreground">No operators registered.</p>
        )}
      </div>
    </div>
  );
}
