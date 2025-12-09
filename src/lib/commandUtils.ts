import { logger } from "./logger";
import { Command } from "@commander-js/extra-typings";

export function withJsonLogger(
  command: Command,
): Command {
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
