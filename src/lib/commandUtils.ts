import { logger } from "./logger";
import { Command } from "@commander-js/extra-typings";

const originalAction = Command.prototype.action;

Command.prototype.action = function (fn: (...args: any[]) => void | Promise<void>): Command {
  const wrappedFn = async (...args: any[]) => {
    try {
      await fn(...args);
      logger.printJson();
    } catch (error: any) {
      const msg = (error.message as string);
      logger.exitError([msg], 2);
    }
  };
  return originalAction.call(this, wrappedFn);
};

export { Command };
