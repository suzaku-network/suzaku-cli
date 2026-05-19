'use client';

import { use } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import type { Address } from 'viem';
import { useGetAllL1s } from '@suzaku-network/suzaku-sdk/react';
import { useNetworkAddresses } from '@/hooks/useNetworkAddresses';
import { L1DetailLayout } from '@/components/l1-detail/L1DetailLayout';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function L1DetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const router = useRouter();
  const { L1_REGISTRY } = useNetworkAddresses();
  const { data: l1s, isLoading } = useGetAllL1s({ l1RegistryAddress: L1_REGISTRY });

  const l1 = l1s?.find((l) => l.address.toLowerCase() === address.toLowerCase());

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader />
      <motion.div
        layoutId={`l1-card-${address}`}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {/* Page header */}
        <div className="flex items-center gap-3 border-b border-border/50 px-6 py-3">
          <Button variant="ghost" size="xs" onClick={() => router.back()}>
            ← Back
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{shortAddr(address)}</span>
            {l1?.metadataURL && (
              <span className="text-xs text-muted-foreground">{l1.metadataURL}</span>
            )}
          </div>
          {isLoading && <Skeleton className="h-4 w-32" />}
        </div>

        {/* Main content */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading L1 data…</p>
          </div>
        ) : !l1 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">L1 {shortAddr(address)} not found in registry.</p>
          </div>
        ) : (
          <L1DetailLayout l1={l1} />
        )}
      </motion.div>
    </div>
  );
}
