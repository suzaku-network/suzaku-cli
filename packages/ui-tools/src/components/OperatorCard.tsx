'use client';

import { motion } from 'motion/react';
import type { Address } from 'viem';
import type { OperatorInfo } from '@suzaku-network/suzaku-sdk/react';

function shortAddr(addr: Address) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface OperatorCardProps {
  operator: OperatorInfo;
}

export function OperatorCard({ operator }: OperatorCardProps) {
  return (
    <motion.div
      className="flex h-36 w-56 shrink-0 flex-col justify-between rounded-xl border border-border/60 bg-card p-4 shadow-sm"
      whileHover={{ scale: 1.02 }}
    >
      <span className="font-mono text-xs text-muted-foreground">{shortAddr(operator.address)}</span>
      <div className="space-y-1">
        {operator.metadataURL ? (
          <p className="truncate text-xs text-muted-foreground">{operator.metadataURL}</p>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">No metadata</p>
        )}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Operator</span>
      </div>
    </motion.div>
  );
}
