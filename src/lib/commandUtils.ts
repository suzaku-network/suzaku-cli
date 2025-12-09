
/* Use this function pattern to wrap any async action to log the result in json format
   Use instead a proxy to propagate correct types to the callback
export function wrapAsyncAction<T>(actionFn: (...args: T[]) => Promise<void>) {
  return async (...args: T[]) => {
    try {
      await actionFn(...args);
    } catch (error) {
      logger.error(error);
      process.exitCode = 1;
    } finally {
      await logger.printJson();
    }
  };
}
*/
import { logger } from "./logger";
import { Command } from "@commander-js/extra-typings";

export function withJsonLogger(
  command: Command,
): Command {


    // Proxy handler for safeWrite methods to simulate the write operation before executing it
    const actionHandler: ProxyHandler<Record<string, any>> = {
      get(target, prop,) {
        const fn = (target as any)[prop]
        if (typeof fn !== 'function') return fn
        return async (args: any, options: any) => {
          try {
            await fn(args, options)
            logger.printJson()
          } catch (error: any) {
            const msg = (error.message as string)
            logger.exitError([msg], 2)
          }
        }
      },
    };

  (command as any).action = new Proxy(command.action as Record<string, any>, actionHandler);

return command;
}
