import type { Hex } from "viem"
import type { Network } from "../types"
import { GLACIER_URLS } from "../types"
import { retryWhileError } from "../utils/retry"

interface SignatureResponse {
  signedMessage: string
}

export interface CollectSignaturesParams {
  network: Network
  message: string
  justification?: string
  signingSubnetId?: string
  glacierUrl?: string
}

export const collectSignatures = async ({
  network,
  message,
  justification,
  signingSubnetId,
  glacierUrl,
}: CollectSignaturesParams): Promise<Hex> => {
  const body: {
    message: string
    justification?: string
    signingSubnetId?: string
    quorumPercentage?: number
  } = { message }

  if (justification) body.justification = justification
  body.signingSubnetId = signingSubnetId
  body.quorumPercentage = 67

  const baseURL = glacierUrl ?? GLACIER_URLS[network]

  const signResponse = await retryWhileError(
    () =>
      fetch(baseURL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    2000,
    30000,
    (result) => result.status !== 500,
  )

  if (!signResponse.ok) {
    const errorText = await signResponse.text()
    throw new Error(
      errorText || `Glacier signature aggregation failed with status: ${signResponse.status}`,
    )
  }

  const { signedMessage } = (await signResponse.json()) as SignatureResponse
  return signedMessage as Hex
}
