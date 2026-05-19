'use client'

import { formatEther } from 'viem'
import { useConnect, useConnectors, useConnection, useDisconnect } from 'wagmi'
import {
  useCChainBalance,
  useMounted,
  usePChainAddress,
  usePChainBalance,
} from '@suzaku-network/suzaku-sdk/react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function shortAddress(addr: string | null | undefined, head = 6, tail = 4) {
  if (!addr) return '—'
  if (addr.length <= head + tail + 1) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

function ChainInfo({
  label,
  address,
  balance,
  isLoading,
}: {
  label: string
  address: string | null | undefined
  balance: string | null
  isLoading: boolean
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{shortAddress(address)}</span>
      {isLoading ? (
        <Skeleton className="mt-0.5 h-3 w-16" />
      ) : (
        <span className="text-xs font-semibold">
          {balance != null ? Number(balance).toFixed(4) : '—'}
          <span className="ml-1 font-normal text-muted-foreground">AVAX</span>
        </span>
      )}
    </div>
  )
}

export function AppHeader() {
  const mounted = useMounted()
  const connection = useConnection()
  const { connect } = useConnect()
  const connectors = useConnectors()
  const { disconnect } = useDisconnect()

  const { data: pAddress } = usePChainAddress()
  const pBalanceQuery = usePChainBalance()
  const cBalanceQuery = useCChainBalance()

  const isConnected = mounted && connection.status === 'connected'

  const pBalance =
    pBalanceQuery.data != null
      ? formatEther(pBalanceQuery.data.balance * 1_000_000_000n)
      : null

  const cBalance =
    cBalanceQuery.data != null ? formatEther(cBalanceQuery.data.value) : null

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-1">
          <button
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            Suzaku
          </button>
          <button
            className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-40"
            disabled
          >
            Kite
          </button>
        </div>

        <div className="flex items-center gap-3">
          {!mounted && <Skeleton className="h-8 w-32" />}

          {mounted && !isConnected &&
            connectors.map((connector) => (
              <Button key={connector.uid} size="sm" onClick={() => connect({ connector })}>
                Connect
              </Button>
            ))
          }

          {mounted && isConnected && (
            <>
              <div className="flex items-center gap-4">
                <ChainInfo
                  label="P-Chain"
                  address={pAddress}
                  balance={pBalance}
                  isLoading={pBalanceQuery.isLoading}
                />
                <div className="h-8 w-px bg-border" />
                <ChainInfo
                  label="C-Chain"
                  address={connection.address}
                  balance={cBalance}
                  isLoading={cBalanceQuery.isLoading}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
