'use client'

import { Activity, ArrowRightLeft, Coins, Mountain, Plug, PlugZap, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { useConnect, useConnection, useConnectors, useDisconnect } from 'wagmi'
import {
  useCChainBalance,
  useCrossChainTransfer,
  usePChainAddress,
  usePChainBalance,
} from '@suzaku-network/suzaku-sdk/react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { BackgroundGradient } from '@/components/ui/background-gradient'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spotlight } from '@/components/ui/spotlight'

function shortAddress(addr: string | null | undefined, head = 6, tail = 4) {
  if (!addr) return '—'
  if (addr.length <= head + tail + 1) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

export default function Page() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const connection = useConnection()
  const { connect, status: connectStatus, error: connectError } = useConnect()
  const connectors = useConnectors()
  const { disconnect } = useDisconnect()

  const { data: pAddress } = usePChainAddress()
  const pBalanceQuery = usePChainBalance()
  const cBalanceQuery = useCChainBalance()
  const transfer = useCrossChainTransfer()

  const isConnected = mounted && connection.status === 'connected'

  return (
    <main className="relative min-h-screen overflow-hidden">
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="white" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 md:py-20">
        <Hero connection={connection} mounted={mounted} />

        <ConnectCard
          isConnected={isConnected}
          mounted={mounted}
          connection={connection}
          connectors={connectors}
          connect={connect}
          connectStatus={connectStatus}
          connectError={connectError ?? null}
          onDisconnect={() => disconnect()}
        />

        {isConnected && (
          <>
            <section>
              <SectionHeader
                icon={<Wallet className="size-4" />}
                title="Balances"
                description="Live P-Chain and C-Chain holdings for the connected wallet."
              />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <BackgroundGradient containerClassName="rounded-2xl">
                  <BalanceCard
                    title="P-Chain"
                    description="Platform Chain · staking"
                    icon={<Mountain className="size-4" />}
                    address={pAddress ?? null}
                    balance={
                      pBalanceQuery.data
                        ? formatEther(pBalanceQuery.data.balance * 1_000_000_000n)
                        : null
                    }
                    isLoading={pBalanceQuery.isLoading}
                  />
                </BackgroundGradient>
                <BackgroundGradient containerClassName="rounded-2xl">
                  <BalanceCard
                    title="C-Chain"
                    description="Contract Chain · EVM"
                    icon={<Coins className="size-4" />}
                    address={connection.address ?? null}
                    balance={cBalanceQuery.data != null ? formatEther(cBalanceQuery.data) : null}
                    isLoading={cBalanceQuery.isLoading}
                  />
                </BackgroundGradient>
              </div>
            </section>

            <section>
              <SectionHeader
                icon={<ArrowRightLeft className="size-4" />}
                title="Cross-chain transfer"
                description="Send AVAX from C-Chain to your derived P-Chain address."
              />
              <TransferCard
                pAddress={pAddress ?? null}
                onSubmit={(amountWei) =>
                  pAddress &&
                  transfer.mutate({
                    to: pAddress,
                    amount: amountWei,
                    destinationChain: 'P',
                  })
                }
                isPending={transfer.isPending}
                error={transfer.error}
                data={transfer.data}
              />
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Hero({
  connection,
  mounted,
}: {
  connection: ReturnType<typeof useConnection>
  mounted: boolean
}) {
  const networkLabel = connection.chain?.name ?? 'No network'
  return (
    <header className="flex flex-col items-start gap-4">
      <Badge variant="outline" className="gap-1.5 px-3 py-1">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        Suzaku SDK · Avalanche
      </Badge>
      <h1 className="text-balance font-heading text-4xl font-semibold tracking-tight md:text-5xl">
        Cross-chain Avalanche dashboard
      </h1>
      <p className="max-w-2xl text-pretty text-muted-foreground">
        Connect your Core wallet to inspect P-Chain and C-Chain balances and move
        AVAX between them. Hooks are shared from{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          @suzaku-network/suzaku-sdk/react
        </code>
        .
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1">
          <Activity className="size-3" />
          {mounted ? connection.status : 'idle'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1">
          Network: {networkLabel}
        </span>
      </div>
    </header>
  )
}

function ConnectCard({
  isConnected,
  mounted,
  connection,
  connectors,
  connect,
  connectStatus,
  connectError,
  onDisconnect,
}: {
  isConnected: boolean
  mounted: boolean
  connection: ReturnType<typeof useConnection>
  connectors: ReturnType<typeof useConnectors>
  connect: ReturnType<typeof useConnect>['connect']
  connectStatus: ReturnType<typeof useConnect>['status']
  connectError: Error | null
  onDisconnect: () => void
}) {
  return (
    <Card className="bg-card/70 backdrop-blur">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <PlugZap className="size-4 text-emerald-400" />
          ) : (
            <Plug className="size-4 text-muted-foreground" />
          )}
          <CardTitle>{isConnected ? 'Wallet connected' : 'Connect wallet'}</CardTitle>
        </div>
        <CardDescription>
          {isConnected
            ? `${shortAddress(connection.address)} · ${connection.chain?.name ?? 'unknown chain'}`
            : 'Use the Core extension (window.avalanche) to sign Avalanche transactions.'}
        </CardDescription>
        <CardAction>
          {isConnected && (
            <Button variant="outline" size="sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {!isConnected && (
          <div className="flex flex-wrap items-center gap-2">
            {mounted &&
              connectors.map((connector) => (
                <Button
                  key={connector.uid}
                  variant="default"
                  onClick={() => connect({ connector })}
                >
                  <Wallet className="size-4" />
                  Connect with {connector.name}
                </Button>
              ))}
            {!mounted && <Skeleton className="h-9 w-44" />}
            <Badge variant="ghost" className="text-xs">
              status: {connectStatus}
            </Badge>
          </div>
        )}
        {connectError && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>{connectError.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span className="uppercase tracking-wide">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground/80">{description}</p>
    </div>
  )
}

function BalanceCard({
  title,
  description,
  icon,
  address,
  balance,
  isLoading,
}: {
  title: string
  description: string
  icon: React.ReactNode
  address: string | null
  balance: string | null
  isLoading: boolean
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card/90 p-6 ring-1 ring-foreground/10 backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            {icon}
            {title}
          </div>
          <p className="mt-1 text-sm text-muted-foreground/80">{description}</p>
        </div>
        <Badge variant="secondary" className="font-mono">
          {title === 'P-Chain' ? 'P' : 'C'}
        </Badge>
      </div>
      <Separator />
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Balance
        </div>
        {isLoading || balance == null ? (
          <Skeleton className="mt-2 h-9 w-40" />
        ) : (
          <div className="mt-1 font-heading text-3xl font-semibold tracking-tight">
            {Number(balance).toFixed(4)}{' '}
            <span className="text-base text-muted-foreground">AVAX</span>
          </div>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Address
        </div>
        <div className="mt-1 break-all font-mono text-xs text-foreground/80">
          {address ?? '—'}
        </div>
      </div>
    </div>
  )
}

function TransferCard({
  pAddress,
  onSubmit,
  isPending,
  error,
  data,
}: {
  pAddress: string | null
  onSubmit: (amountWei: bigint) => void
  isPending: boolean
  error: Error | null
  data: { txHashes: Array<{ txHash: string; chainAlias: 'P' | 'C' }> } | undefined
}) {
  const [amount, setAmount] = useState('')

  const parsedAmount = (() => {
    const n = Number(amount)
    if (!amount || Number.isNaN(n) || n <= 0) return null
    try {
      return BigInt(Math.round(n * 1e18))
    } catch {
      return null
    }
  })()

  return (
    <Card className="bg-card/70 backdrop-blur">
      <CardHeader>
        <CardTitle>C-Chain → P-Chain</CardTitle>
        <CardDescription>
          Destination: <span className="font-mono text-xs">{shortAddress(pAddress, 10, 8)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <label htmlFor="amount" className="text-xs uppercase tracking-wide text-muted-foreground">
            Amount (AVAX)
          </label>
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={!pAddress || parsedAmount == null || isPending}
            onClick={() => parsedAmount && onSubmit(parsedAmount)}
          >
            <ArrowRightLeft className="size-4" />
            {isPending ? 'Submitting…' : 'Send'}
          </Button>
          <Badge variant="outline" className="text-xs">
            destinationChain: P
          </Badge>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Transfer failed</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {data && (
          <Alert>
            <AlertTitle>Submitted</AlertTitle>
            <AlertDescription>
              <ul className="space-y-1 font-mono text-xs">
                {data.txHashes.map((tx) => (
                  <li key={tx.txHash}>
                    <span className="text-muted-foreground">{tx.chainAlias}: </span>
                    {tx.txHash}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
