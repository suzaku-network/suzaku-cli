'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatUnits } from 'viem';
import type { Address } from 'viem';
import type { OperatorWithNodes } from '@/hooks/useL1OperatorsWithNodes';

interface LinkData {
  vaultAddress: Address;
  operatorAddress: Address;
  stakeValue: bigint;
  totalL1Stake: bigint;
  sourceY: number;
  targetY: number;
}

interface OperatorVaultLinksProps {
  selectedOperator: Address | null;
  operators: OperatorWithNodes[];
  vaultRefs: Map<Address, HTMLElement | null>;
  operatorRef: HTMLElement | null;
  containerRef: HTMLElement | null;
}

export function OperatorVaultLinks({
  selectedOperator,
  operators,
  vaultRefs,
  operatorRef,
  containerRef,
}: OperatorVaultLinksProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  const operator = operators.find((o) => o.address === selectedOperator);

  const computeLinks = useCallback(() => {
    if (!operatorRef || !containerRef || !operator) {
      setLinks([]);
      return;
    }
    const containerRect = containerRef.getBoundingClientRect();
    const opRect = operatorRef.getBoundingClientRect();
    const opY = opRect.top + opRect.height / 2 - containerRect.top;

    const computed: LinkData[] = [];
    vaultRefs.forEach((el, vaultAddr) => {
      if (!el) return;
      const vaultRect = el.getBoundingClientRect();
      const vY = vaultRect.top + vaultRect.height / 2 - containerRect.top;
      computed.push({
        vaultAddress: vaultAddr,
        operatorAddress: operator.address,
        stakeValue: operator.usedStake,
        totalL1Stake: operator.totalStake,
        sourceY: vY,
        targetY: opY,
      });
    });
    setLinks(computed);
    setDims({ width: containerRect.width, height: containerRect.height });
  }, [operator, vaultRefs, operatorRef, containerRef]);

  useEffect(() => {
    computeLinks();
    const observer = new ResizeObserver(computeLinks);
    if (containerRef) observer.observe(containerRef);
    return () => observer.disconnect();
  }, [computeLinks, containerRef]);

  if (!selectedOperator || links.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 z-10"
      width={dims.width}
      height={dims.height}
    >
      <AnimatePresence>
        {links.map((link) => {
          const x1 = 0;
          const x2 = dims.width;
          const pct =
            link.totalL1Stake > 0n
              ? Number((link.stakeValue * 100n) / link.totalL1Stake)
              : 0;
          const strokeW = Math.max(1, Math.min(4, pct / 10));
          const path = `M ${x1} ${link.sourceY} C ${dims.width * 0.35} ${link.sourceY}, ${dims.width * 0.65} ${link.targetY}, ${x2} ${link.targetY}`;

          return (
            <g key={`${link.vaultAddress}-${link.operatorAddress}`}>
              <motion.path
                d={path}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={strokeW}
                strokeOpacity={0.6}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ pathLength: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
              <motion.text
                x={dims.width / 2}
                y={(link.sourceY + link.targetY) / 2 - 6}
                textAnchor="middle"
                fontSize={9}
                fill="hsl(var(--primary))"
                fillOpacity={0.9}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.3 }}
              >
                {pct.toFixed(1)}% · {formatUnits(link.stakeValue, 18).slice(0, 6)}
              </motion.text>
            </g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}
