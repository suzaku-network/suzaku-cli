import { logger } from "./logger";
import { Command as CommandBase, OptionValues } from "@commander-js/extra-typings";
import { ExtendedClient, ExtendedWalletClient, ExtendedPublicClient } from "../client";
import { generateClient } from "../client";
import { Config, getConfig } from "../config";
import { Hex } from "viem";

declare module "@commander-js/extra-typings" {
  interface Command<
    Args extends any[] = [],
    Opts extends OptionValues = {},
    GlobalOpts extends OptionValues = {}
  > {
    asyncAction(
      options: { signer: true },
      fn: (this: this, config: Config<ExtendedWalletClient>, ...args: [...Args, Opts, this]) => void | Promise<void>,
    ): this;
    asyncAction(
      options: { signer?: false },
      fn: (this: this, config: Config<ExtendedPublicClient>, ...args: [...Args, Opts, this]) => void | Promise<void>,
    ): this;
    asyncAction(
      fn: (this: this, config: Config<ExtendedPublicClient>, ...args: [...Args, Opts, this]) => void | Promise<void>,
    ): this;
  }
}

CommandBase.prototype.asyncAction = function (...fnArgs: any[]) {
  let options = { signer: false };
  let fn: any;

  if (fnArgs.length >= 2 && typeof fnArgs[1] === 'function') {
    options = fnArgs[0] || { signer: false };
    fn = fnArgs[1];
  } else {
    fn = fnArgs[0];
  }

  let rootParent = this.parent!;
  while (rootParent?.parent) {
    rootParent = rootParent.parent;
  }
  const wrappedFn = async (...args: any[]) => {
    try {
      const opts = rootParent.opts() as {
        network: string;
        privateKey?: Hex;
        safe?: Hex;
        wait?: number;
        skipAbiValidation?: boolean;
      };
      const client = await generateClient(opts.network, options.signer ? opts.privateKey : undefined, opts.safe);
      const config = getConfig(client, opts.wait, opts.skipAbiValidation);
      const result = await (fn as any).call(this, config, ...args);
      logger.printJson();
      return result;
    } catch (error: any) {
      error.stack = error.stack?.split("\n").slice(0, -1).join("\n");
      logger.error(error);
      process.exit(1);
    }
  };
  return this.action(wrappedFn as any);
};
