import { Command, Option } from '@commander-js/extra-typings';
import { Pass } from "./lib/pass";
import { confPath } from './config';
import { logger, wrapAsyncAction } from './lib/logger';
import { getClipboardValue, setClipboardValue, getAddresses } from './lib/utils';
import { ParserAddress } from './lib/cliParser';

export const passPath = confPath + '/.password-store'

export function buildCommands(program: Command) {
  program
    .command("list-gpg-ids")
    .description("List available gpg key ids installed on the system")
    .action(wrapAsyncAction(async () => logger.log(Pass.listGPGIds())))

  program
    .command("init")
    .description("Initialize the keystore")
    .argument("<gpgKeyIds...>", "desired gpg key ids used to encrypt/decrypt the key store")
    .action(wrapAsyncAction(async (gpgKeyIds: string[]) => {
      new Pass(passPath, gpgKeyIds)
      logger.log(`Key store initialized with GPG keys: ${gpgKeyIds.join(' ')}`);
    }))

  program
    .command("create")
    .description("create a new encrypted secret")
    .argument("<name>", "Name of the secret to create")
    .addOption(new Option('-c, --clip', 'Extract the value of the secret to create from the clipboard and erase it afterwards').conflicts('value'))
    .addOption(new Option('-v, --value', 'Value of the secret to create').conflicts('clip'))
    .action(wrapAsyncAction(async (name: string, options) => {
      const opts = program.opts();
      let value: string;
      if (options.clip) {
        value = getClipboardValue();
      } else if (options.value) {
        value = options.value;
      } else {
        throw new Error("Either --clip or --value must be provided to create a secret.");
      }
      // Validate address
      const address = getAddresses(value as string, (opts as { network: string }).network);
      ParserAddress(address.C);
      logger.log(`Address for secret '${name}':\n  C-Chain: ${address.C}\n  P-Chain: ${address.P}`);
      if (options.clip) setClipboardValue(''); // Erase clipboard
      // Insert secret
      const pass = new Pass(passPath)
      pass.insert(name, value)
      logger.log(`Secret '${name}' created successfully.`);
    }))

  program
    .command("rm")
    .description("remove an encrypted secret")
    .argument("<name>", "Name of the secret to remove")
    .action(wrapAsyncAction(async (name: string) => {
      const pass = new Pass(passPath)
      pass.rm(name)
      logger.log(`Secret '${name}' removed successfully.`);
    }))

  program
    .command("list")
    .description("List all encrypted secrets")
    .option("-h, --hide-addresses", "Hide addresses of the secrets")
    .action(wrapAsyncAction(async (options) => {
      const pass = new Pass(passPath)
      pass
      logger.log("Available secrets:");
      logger.log(pass.toString(!options.hideAddresses))
    }));

  program
    .command("addresses")
    .description("Show the address of an encrypted private key")
    .argument("<name>", "Name of the secret to show the address for")
    .action(wrapAsyncAction(async (name: string) => {
      const opts = program.opts();
      const pass = new Pass(passPath)
      const privateKey = pass.show(name);
      const address = getAddresses(privateKey as string, (opts as { network: string }).network);
      ParserAddress(address.C); // Validate address
      logger.log(`Address for secret '${name}':\n  C-Chain: ${address.C}\n  P-Chain: ${address.P}`);
    }));
}
