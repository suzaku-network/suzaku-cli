'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import type { Address } from 'viem';
import type { L1Info } from '@suzaku-network/suzaku-sdk/react';

function shortAddr(addr: Address) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface L1CardProps {
  l1: L1Info;
}

export function L1Card({ l1 }: L1CardProps) {
  const router = useRouter();
  const hasMiddleware = l1.middlewareAddress !== '0x0000000000000000000000000000000000000000';

  return (
    <motion.button
      layoutId={`l1-card-${l1.address}`}
      onClick={() => router.push(`/l1/${l1.address}`)}
      className="group flex h-36 w-56 shrink-0 flex-col justify-between rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm transition-colors hover:border-border hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-xs text-muted-foreground">{shortAddr(l1.address)}</span>
        {hasMiddleware && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Middleware</span>
        )}
      </div>
      <div className="space-y-1">
        {l1.metadataURL ? (
          <p className="truncate text-xs text-muted-foreground">{l1.metadataURL}</p>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">No metadata</p>
        )}
        <p className="font-mono text-[10px] text-muted-foreground/60">{shortAddr(l1.middlewareAddress)}</p>
      </div>
    </motion.button>
  );
}
