'use client';

import { motion, AnimatePresence } from 'motion/react';
import { formatUnits } from 'viem';
import type { Address } from 'viem';
import type { StakerWithPositions } from '@/hooks/useVaultStakers';

function shortAddr(addr: Address) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface StakerCardProps {
  staker: StakerWithPositions;
  selectedVault: Address | null;
  isSelected: boolean;
  onSelect: (addr: Address | null) => void;
}

export function StakerCard({ staker, selectedVault, isSelected, onSelect }: StakerCardProps) {
  const highlightedVaultPos = selectedVault ? staker.vaults[selectedVault] : null;
  const isHighlighted = !!highlightedVaultPos;

  return (
    <motion.button
      layout
      onClick={() => onSelect(isSelected ? null : staker.address)}
      className={[
        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
        isSelected
          ? 'border-primary bg-primary/10'
          : isHighlighted
            ? 'border-primary/50 bg-primary/5'
            : 'border-border/50 bg-card hover:bg-card/80',
      ].join(' ')}
      transition={{ layout: { duration: 0.2 } }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs">{shortAddr(staker.address)}</span>
        {isHighlighted && !isSelected && (
          <span className="text-xs font-semibold text-primary">
            {highlightedVaultPos.percentage.toFixed(2)}%
          </span>
        )}
      </div>
      <AnimatePresence>
        {(isSelected || isHighlighted) && selectedVault && staker.vaults[selectedVault] && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1 overflow-hidden"
          >
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Share</span>
              <span className="font-semibold text-foreground">
                {staker.vaults[selectedVault].percentage.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Active shares</span>
              <span className="font-mono text-foreground">
                {formatUnits(staker.vaults[selectedVault].activeShares, 18).slice(0, 8)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
