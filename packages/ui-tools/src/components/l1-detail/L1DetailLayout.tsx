'use client';

import { useState, useRef, useCallback } from 'react';
import type { Address } from 'viem';
import type { L1Info } from '@suzaku-network/suzaku-sdk/react';
import { useL1MiddlewareAddresses } from '@/hooks/useL1MiddlewareAddresses';
import { useL1Vaults } from '@/hooks/useL1Vaults';
import { useVaultStakers } from '@/hooks/useVaultStakers';
import { useL1OperatorsWithNodes } from '@/hooks/useL1OperatorsWithNodes';
import { StakerCard } from './StakerCard';
import { VaultCard } from './VaultCard';
import { OperatorDetailCard } from './OperatorDetailCard';
import { NodeCard } from './NodeCard';
import { OperatorVaultLinks } from './OperatorVaultLinks';
import { ActionBar } from './ActionBar';
import { Skeleton } from '@/components/ui/skeleton';

interface L1DetailLayoutProps {
  l1: L1Info;
}

export function L1DetailLayout({ l1 }: L1DetailLayoutProps) {
  const [selectedStaker, setSelectedStaker] = useState<Address | null>(null);
  const [selectedVault, setSelectedVault] = useState<Address | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<Address | null>(null);

  const { vaultManagerAddress } = useL1MiddlewareAddresses(l1.middlewareAddress);
  const { vaults, isLoading: vaultsLoading } = useL1Vaults(vaultManagerAddress);
  const vaultAddresses = vaults.map((v) => v.address);
  const { stakers, isLoading: stakersLoading } = useVaultStakers(vaultAddresses);
  const { operators, isLoading: opsLoading } = useL1OperatorsWithNodes(l1.middlewareAddress);

  // Auto-select first operator
  const currentOperator = selectedOperator ?? operators[0]?.address ?? null;
  const operatorData = operators.find((o) => o.address === currentOperator);

  // Refs for SVG link positioning
  const containerRef = useRef<HTMLDivElement>(null);
  const vaultEls = useRef<Map<Address, HTMLElement | null>>(new Map());
  const operatorElRef = useRef<HTMLButtonElement | null>(null);

  const setVaultRef = useCallback((addr: Address) => (el: HTMLButtonElement | null) => {
    vaultEls.current.set(addr, el);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 3-column body */}
      <div ref={containerRef} className="relative flex min-h-0 flex-1 gap-0 overflow-hidden">
        {/* Left: stakers + vaults */}
        <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border/40 p-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stakers</h3>
            {stakersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
              </div>
            ) : stakers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No stakers found.</p>
            ) : (
              <div className="space-y-2">
                {stakers.map((s) => (
                  <StakerCard
                    key={s.address}
                    staker={s}
                    selectedVault={selectedVault}
                    isSelected={selectedStaker === s.address}
                    onSelect={setSelectedStaker}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vaults</h3>
            {vaultsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : vaults.length === 0 ? (
              <p className="text-xs text-muted-foreground">No vaults.</p>
            ) : (
              <div className="space-y-2">
                {vaults.map((v) => (
                  <VaultCard
                    key={v.address}
                    ref={setVaultRef(v.address)}
                    vault={v}
                    selectedStaker={selectedStaker}
                    selectedOperator={currentOperator}
                    stakers={stakers}
                    isSelected={selectedVault === v.address}
                    onSelect={setSelectedVault}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Center: SVG links */}
        <div className="relative flex-1 overflow-hidden">
          <OperatorVaultLinks
            selectedOperator={currentOperator}
            operators={operators}
            vaultRefs={vaultEls.current}
            operatorRef={operatorElRef.current}
            containerRef={containerRef.current}
          />
        </div>

        {/* Right: operators + nodes */}
        <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/40 p-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Operators</h3>
            {opsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : operators.length === 0 ? (
              <p className="text-xs text-muted-foreground">No operators.</p>
            ) : (
              <div className="space-y-2">
                {operators.map((op) => (
                  <OperatorDetailCard
                    key={op.address}
                    ref={op.address === currentOperator ? operatorElRef : undefined}
                    operator={op}
                    isSelected={op.address === currentOperator}
                    onSelect={(addr) => setSelectedOperator(addr)}
                  />
                ))}
              </div>
            )}
          </section>

          {operatorData && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nodes ({operatorData.nodeIds.length})
              </h3>
              <div className="space-y-3">
                {operatorData.nodeIds.map((nodeId, idx) => (
                  <NodeCard
                    key={nodeId}
                    nodeId={nodeId}
                    nodeIndex={idx}
                    operatorUsedStake={operatorData.usedStake}
                    operatorTotalStake={operatorData.totalStake}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <ActionBar middlewareAddress={l1.middlewareAddress} selectedOperator={currentOperator} />
    </div>
  );
}
