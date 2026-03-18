export const retryWhileError = async <T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  timeoutMs: number,
  accept: (result: T) => boolean = () => true,
): Promise<T> => {
  const start = Date.now()
  let lastErr: unknown

  while (true) {
    try {
      const result = await fetcher()
      if (accept(result)) return result
      else
        throw new Error(
          "retryWhileError: Result not accepted by predicate\n",
        )
    } catch (e) {
      lastErr = e
      const elapsed = Date.now() - start
      const remaining = timeoutMs - elapsed
      if (remaining <= 0) break
      await new Promise((res) => setTimeout(res, Math.min(intervalMs, remaining)))
    }
  }

  throw new Error(
    `Timeout reached after ${timeoutMs}ms: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  )
}
