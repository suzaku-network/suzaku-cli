'use client';

import type { Address } from 'viem';
import { Button } from '@/components/ui/button';

interface ActionBarProps {
  middlewareAddress: Address;
  selectedOperator: Address | null;
}

export function ActionBar({ middlewareAddress: _middlewareAddress, selectedOperator }: ActionBarProps) {

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/50 bg-background/80 px-4 py-3 backdrop-blur">
      <span className="text-xs text-muted-foreground mr-2">Operator:</span>
      <Button
        size="xs"
        variant="outline"
        onClick={() => {/* TODO: open add operator modal */}}
      >
        Add operator
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={!selectedOperator}
        onClick={() => {/* TODO: open remove operator modal */}}
      >
        Remove operator
      </Button>

      <div className="mx-2 h-4 w-px bg-border" />
      <span className="text-xs text-muted-foreground mr-2">Validator:</span>

      <Button
        size="xs"
        variant="outline"
        disabled={!selectedOperator}
        onClick={() => {/* TODO: useAddNode trigger */}}
      >
        Init add
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={!selectedOperator}
        onClick={() => {/* TODO: completeValidatorRegistration */}}
      >
        Complete add
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={!selectedOperator}
        onClick={() => {/* TODO: initiate removal */}}
      >
        Init remove
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={!selectedOperator}
        onClick={() => {/* TODO: complete removal */}}
      >
        Complete remove
      </Button>

      <div className="mx-2 h-4 w-px bg-border" />
      <span className="text-xs text-muted-foreground mr-2">Delegator:</span>
      <Button size="xs" variant="ghost" disabled title="Coming soon">
        Init add
      </Button>
      <Button size="xs" variant="ghost" disabled title="Coming soon">
        Complete add
      </Button>
    </div>
  );
}
