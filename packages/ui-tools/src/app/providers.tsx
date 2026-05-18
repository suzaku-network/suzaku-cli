'use client'

import { SuzakuProviders } from '@suzaku-network/suzaku-sdk/react'
import type { ReactNode } from 'react'
import type { State } from 'wagmi'

import { getConfig } from '@/wagmi'

export function Providers(props: { children: ReactNode; initialState?: State }) {
  return (
    <SuzakuProviders config={getConfig()} initialState={props.initialState}>
      {props.children}
    </SuzakuProviders>
  )
}
