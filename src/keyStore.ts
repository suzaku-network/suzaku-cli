import { Command, Option } from '@commander-js/extra-typings';
import { Pass } from "./lib/pass";
import { confPath } from './config';
import { logger } from './lib/logger';
import { getAddresses } from './lib/utils';
import { getClipboardValue, setClipboardValue, prompt } from './lib/cliUtils';
import { ParserAddress } from './lib/cliParser';

export const passPath = confPath + '/.password-store'

export function buildCommands(program: Command) {
  program
    .command("list-gpg-ids")
    .description("List available gpg key ids installed on the system")
    .action(async () => logger.log(Pass.listGPGIds()))

  program
    .command("init")
    .description("Initialize the keystore")
    .argument("<gpgKeyIds...>", "desired gpg key ids used to encrypt/decrypt the key store")
    .action(async (gpgKeyIds: string[]) => {
      new Pass(passPath, gpgKeyIds)
      logger.log(`Key store initialized with GPG keys: ${gpgKeyIds.join(' ')}`);
    });

  program
    .command("create")
    .description("create a new encrypted secret")
    .argument("<name>", "Name of the secret to create")
    .addOption(new Option('-c, --clip', 'Extract the value of the secret to create from the clipboard and erase it afterwards').conflicts(['value', 'prompt']))
    .addOption(new Option('-v, --value <value>', 'Value of the secret to create').conflicts(['clip', 'prompt']))
    .addOption(new Option('-p, --prompt', 'Prompt for the value of the secret to create').conflicts(['clip', 'value']))
    .action(async (name: string, options) => {
      const opts = program.opts() as { network: string, yes: boolean };
      let value: string;

      if (options.clip) {
        value = getClipboardValue();
        setClipboardValue(''); // Erase clipboard
      } else if (options.value) {
        value = options.value;
      } else if (options.prompt) {
        value = await prompt("Enter the value of the secret to create: ") || ""
      } else {
        throw new Error("Either --clip or --value or --prompt must be provided to create a secret.");
      }
      if (value === "") throw new Error("Value cannot be empty");
      if (value === "ledger") throw new Error("Value 'ledger' is reserved. Use another value.");
      // Validate address
      const address = getAddresses(value as string, opts.network);
      ParserAddress(address.C);
      logger.log(`Address for secret '${name}':\n  C-Chain: ${address.C}\n  P-Chain: ${address.P}`);
      // Insert secret
      const pass = new Pass(passPath)
      if (pass.exists(name) && !opts.yes) {
        const overwrite = await prompt(`Secret '${name}' already exists. Overwrite? (y/n)`);
        if (overwrite !== 'y') return;
      }
      pass.insert(name, value)
      logger.log(`Secret '${name}' created successfully.`);
    });

  program
    .command("rm")
    .description("remove an encrypted secret")
    .argument("<name>", "Name of the secret to remove")
    .action(async (name: string) => {
      const opts = program.opts() as { yes: boolean };
      const pass = new Pass(passPath)
      if (!opts.yes) {
        const confirm = await prompt(`Are you sure you want to remove secret '${name}'? (y/n)`);
        if (confirm !== 'y') return;
      }
      pass.rm(name)
      logger.log(`Secret '${name}' removed successfully.`);
    });

  program
    .command("list")
    .description("List all encrypted secrets")
    .option("-h, --hide-addresses", "Hide account addresses of the secrets")
    // .option("-b, --balance", "Show account balance of the secrets")
    .action(async (options) => {
      const pass = new Pass(passPath)
      pass
      logger.log("Available secrets:");
      logger.log(pass.toString(!options.hideAddresses))
    });

  program
    .command("addresses")
    .description("Show the address of an encrypted private key")
    .argument("<name>", "Name of the secret to show the address for")
    .action(async (name: string) => {
      const opts = program.opts() as { network: string };
      const pass = new Pass(passPath)
      const privateKey = pass.show(name);
      const address = getAddresses(privateKey as string, opts.network);
      ParserAddress(address.C); // Validate address
      logger.log(`Address for secret '${name}':\n  C-Chain: ${address.C}\n  P-Chain: ${address.P}`);
    });
}
