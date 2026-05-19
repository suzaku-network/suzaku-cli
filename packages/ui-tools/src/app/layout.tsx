import './globals.css'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { cookieToInitialState } from 'wagmi'

import { cn } from '@/lib/utils'
import { getConfig } from '../wagmi'
import { Providers } from './providers'
import { MotionLayout } from '@/components/MotionLayout'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Suzaku · Avalanche Wallet',
  description: 'Cross-chain Avalanche dashboard powered by Suzaku SDK.',
}

export default async function RootLayout(props: { children: ReactNode }) {
  const initialState = cookieToInitialState(
    getConfig(),
    (await headers()).get('cookie'),
  )
  return (
    <html lang="en" className={cn('dark', geist.variable)}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers initialState={initialState}>
          <MotionLayout>{props.children}</MotionLayout>
        </Providers>
      </body>
    </html>
  )
}
