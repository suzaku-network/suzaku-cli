import { utils } from "@avalabs/avalanchejs"
import type { Network } from "../types"
import { AVALANCHE_C_CHAIN_IDS } from "../types"

const NETWORK_HRP: Record<Network, string> = {
  fuji: "fuji",
  mainnet: "avax",
}

/**
 * Core wallet always returns P-Chain addresses with "avax" HRP (e.g. P-avax1…),
 * but the Fuji P-Chain RPC expects "fuji" HRP. Re-encode with the correct one.
 */
const normalizePChainAddress = (address: string, network: Network): string => {
  const hrp = NETWORK_HRP[network]
  const raw = address.startsWith("P-") ? address.slice(2) : address
  const [, bytes] = utils.parseBech32(raw)
  return `P-${utils.formatBech32(hrp, bytes)}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface AvalancheSignTransactionResult {
  signedTransactionHex: string
  signatures: Array<{
    signature: string
    sigIndices: number[]
  }>
}

/**
 * Abstraction for signing P-Chain transactions.
 * The SDK builds unsigned transactions with AvalancheJS, and
 * the signer handles signing + optional submission.
 */
export interface PChainSigner {
  pChainAddress: string
  signTransaction(transactionHex: string, utxoIds: string[]): Promise<AvalancheSignTransactionResult>
}

export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
}

export type SignerDebugLog = (tag: string, data?: unknown) => void

export interface CreateCoreWalletPChainSignerOptions {
  /**
   * The Core wallet provider — should be `window.avalanche` (or `window.ethereum`).
   *
   * Avoid passing a wagmi-wrapped provider here; wagmi can become stale after
   * chain switches, which silently kills the signing request.
   */
  provider: EIP1193Provider
  network: Network
  evmAddress?: string
  debug?: SignerDebugLog
  /** Timeout in ms for the avalanche_signTransaction call. Default: 120000 (2 min) */
  signTimeoutMs?: number
}

/**
 * Creates a PChainSigner backed by Core wallet's `avalanche_signTransaction` RPC method.
 *
 * Core wallet must be on the Avalanche primary-network C-Chain (Fuji 43113 /
 * Mainnet 43114) for P-Chain signing to work. The signer automatically switches
 * to the correct chain before signing and restores the original chain afterward.
 *
 * **Important**: Pass `window.avalanche` as the provider — not a wagmi connector.
 * Wagmi-wrapped providers can break after chain switches.
 *
 * Usage:
 * ```ts
 * const [address] = await walletClient.getAddresses()
 * const signer = await createCoreWalletPChainSigner({
 *   provider: window.avalanche,
 *   network: "fuji",
 *   evmAddress: address,
 *   debug: (tag, data) => console.log(`[PChainSigner] ${tag}`, data),
 * })
 * ```
 */
export const createCoreWalletPChainSigner = async (
  options: CreateCoreWalletPChainSignerOptions,
): Promise<PChainSigner> => {
  const {
    provider,
    network,
    evmAddress,
    debug = () => {},
    signTimeoutMs = 120_000,
  } = options

  debug("avalanche_getAccounts:requesting")
  const accounts = (await provider.request({
    method: "avalanche_getAccounts",
  })) as Array<{ addressPVM?: string; addressAVM?: string; addressC?: string }>
  debug("avalanche_getAccounts:received", { count: accounts.length, accounts })

  const pChainAccount = evmAddress
    ? accounts.find(
        (acc) => acc.addressC?.toLowerCase() === evmAddress.toLowerCase(),
      )
    : accounts.find((acc) => acc.addressPVM)

  if (!pChainAccount?.addressPVM) {
    throw new Error(
      `No P-Chain account found in Core wallet. ` +
      `evmAddress filter: ${evmAddress ?? "none"}, ` +
      `accounts returned: ${JSON.stringify(accounts)}`,
    )
  }

  const rawAddress = pChainAccount.addressPVM
  const normalizedAddress = normalizePChainAddress(rawAddress, network)
  debug("address:normalized", { raw: rawAddress, normalized: normalizedAddress })

  const targetCChainId = AVALANCHE_C_CHAIN_IDS[network]
  const targetChainHex = `0x${targetCChainId.toString(16)}`

  return {
    pChainAddress: normalizedAddress,

    async signTransaction(
      transactionHex: string,
      utxoIds: string[],
    ): Promise<AvalancheSignTransactionResult> {
      debug("signTransaction:start", {
        txHexLength: transactionHex.length,
        utxoCount: utxoIds.length,
        utxoIds,
      })

      // --- Switch to primary-network C-Chain ---
      const currentChainId = await provider.request({
        method: "eth_chainId",
      }) as string
      debug("signTransaction:currentChain", { currentChainId, targetChainHex })

      const needsSwitch = currentChainId.toLowerCase() !== targetChainHex.toLowerCase()
      if (needsSwitch) {
        debug("signTransaction:switchingChain", { from: currentChainId, to: targetChainHex })
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainHex }],
          })
          debug("signTransaction:chainSwitchedBack")
        } catch (switchError) {
          debug("signTransaction:chainSwitchFailed", switchError)
          throw new Error(
            `Failed to switch Core wallet to chain ${targetChainHex}: ${switchError instanceof Error ? switchError.message : String(switchError)}`,
          )
        }
      }

      // --- Sign with timeout ---
      try {
        debug("signTransaction:callingAvalancheSign", {
          txHexPreview: transactionHex.slice(0, 40) + "...",
          chainAlias: "P",
          utxoIds,
        })

        const signPromise = provider.request({
          method: "avalanche_signTransaction",
          params: {
            transactionHex,
            chainAlias: "P",
            utxos: utxoIds,
          },
        })

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(
              `avalanche_signTransaction timed out after ${signTimeoutMs}ms. ` +
              `The signing popup likely never appeared. ` +
              `Make sure you pass window.avalanche as the provider (not a wagmi-wrapped provider). ` +
              `If the popup appeared but you didn't act, increase signTimeoutMs.`,
            )),
            signTimeoutMs,
          )
        })

        const result = await Promise.race([signPromise, timeoutPromise])

        debug("signTransaction:rawResultType", typeof result)

        const normalized: AvalancheSignTransactionResult =
          typeof result === "string"
            ? { signedTransactionHex: result, signatures: [] }
            : result as AvalancheSignTransactionResult

        if (!normalized.signedTransactionHex) {
          throw new Error(
            `avalanche_signTransaction returned an unexpected result: ${JSON.stringify(result)}`,
          )
        }

        debug("signTransaction:signed", {
          signedHexLength: normalized.signedTransactionHex.length,
        })
        return normalized
      } catch (signError) {
        debug("signTransaction:signFailed", signError)
        throw signError instanceof Error
          ? signError
          : new Error(`avalanche_signTransaction failed: ${JSON.stringify(signError)}`)
      } finally {
        if (needsSwitch) {
          debug("signTransaction:restoringChain", { to: currentChainId })
          try {
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: currentChainId }],
            })
            debug("signTransaction:chainRestored")
          } catch {
            debug("signTransaction:chainRestoreFailed")
          }
        }
      }
    },
  }
}
