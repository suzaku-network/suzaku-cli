import {
  getContract,
  decodeErrorResult,
  toFunctionSelector,
  BaseError,
  ContractFunctionRevertedError,
  type Abi,
  type Hex,
  type WalletClient,
  type PublicClient,
  type Transport,
  type Chain,
  type Account,
  type AccessList,
  type GetContractReturnType,
} from "viem"
import { SdkErrorsABI } from "../abis/errors"

type ContractWriteOptions = {
  value?: bigint
  accessList?: AccessList
  chain?: Chain | null
  account?: Account
}

type SafeWriteProxy = Record<
  string,
  (args: unknown, options?: ContractWriteOptions) => Promise<Hex>
>

const formatDecodedArgs = (args: readonly unknown[] | undefined): string => {
  if (!args || args.length === 0) return ""
  const formatted = args.map((arg) => {
    if (typeof arg === "bigint") return arg.toString()
    return String(arg)
  })
  return ` (${formatted.join(", ")})`
}

const selectorToErrorName = new Map<string, string>(
  SdkErrorsABI.map((entry) => {
    const params = entry.inputs.map((i) => i.type).join(",")
    return [toFunctionSelector(`${entry.name}(${params})`), entry.name]
  }),
)

const tryDecodeContractError = (error: unknown): string | undefined => {
  if (!(error instanceof BaseError)) return undefined

  const revertError = error.walk(
    (e) => e instanceof ContractFunctionRevertedError,
  ) as ContractFunctionRevertedError | null

  if (revertError?.data?.errorName) {
    return `${revertError.data.errorName}${formatDecodedArgs(revertError.data.args as readonly unknown[] | undefined)}`
  }

  const hexSources = [
    (error as any).details as string | undefined,
    (revertError as any)?.signature as string | undefined,
    error.shortMessage,
  ]

  for (const source of hexSources) {
    if (typeof source !== "string") continue
    const hexMatch = source.match(/0x[0-9a-fA-F]{8,}/)
    if (!hexMatch) continue

    try {
      const decoded = decodeErrorResult({
        abi: SdkErrorsABI,
        data: hexMatch[0] as Hex,
      })
      return `${decoded.errorName}${formatDecodedArgs(decoded.args)}`
    } catch {
      const selector = hexMatch[0].slice(0, 10) as Hex
      const name = selectorToErrorName.get(selector)
      if (name) return name
    }
  }

  return undefined
}

const extractReadableError = (fnName: string, error: unknown): Error => {
  const decoded = tryDecodeContractError(error)
  if (decoded) {
    return new Error(`${fnName} reverted: ${decoded}`)
  }

  if (error instanceof BaseError) {
    const shortMessage = error.shortMessage ?? error.message
    return new Error(`${fnName} failed: ${shortMessage}`)
  }

  if (error instanceof Error) {
    return new Error(`${fnName} failed: ${error.message}`)
  }

  return new Error(`${fnName} failed: ${String(error)}`)
}

/**
 * Creates a viem contract instance with a simplified `safeWrite` proxy.
 * safeWrite: simulate -> write -> wait for receipt -> return hash.
 * Automatically decodes contract errors into human-readable messages.
 */
export const createSdkContract = (params: {
  abi: Abi
  address: Hex
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  confirmations?: number
}): {
  read: Record<string, (...args: unknown[]) => Promise<unknown>>
  write: Record<string, (...args: unknown[]) => Promise<Hex>>
  safeWrite: SafeWriteProxy
  address: Hex
  abi: Abi
} => {
  const { abi, address, walletClient, publicClient, confirmations = 1 } = params

  const contract = getContract({
    abi,
    address,
    client: { public: publicClient, wallet: walletClient },
  }) as GetContractReturnType<Abi, { public: PublicClient; wallet: WalletClient }>

  const safeWrite = new Proxy((contract as any).write as Record<string, any>, {
    get(target, prop) {
      const fn = target[prop as string]
      if (typeof fn !== "function") return fn

      return async (args: unknown, options?: ContractWriteOptions) => {
        const name = String(prop)

        try {
          const simulateFn = (contract as any).simulate?.[prop as string]
          if (typeof simulateFn === "function") {
            await simulateFn(args, {
              ...options,
              account: walletClient.account,
            })
          }
        } catch (error) {
          throw extractReadableError(name, error)
        }

        const hash: Hex = await fn(args, {
          chain: null,
          ...options,
        })

        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations,
        })

        if (receipt.status === "reverted") {
          throw new Error(`${name} transaction reverted (tx: ${hash})`)
        }

        return hash
      }
    },
  }) as SafeWriteProxy

  return {
    read: (contract as any).read,
    write: (contract as any).write,
    safeWrite,
    address,
    abi,
  }
}

export type SdkContract = ReturnType<typeof createSdkContract>
