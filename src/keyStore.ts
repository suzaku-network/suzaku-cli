import { Command } from '@commander-js/extra-typings';
import { Pass } from "./lib/pass";
import { confPath } from './config';
import { logger } from './lib/logger';

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
      const pass = new Pass(passPath, gpgKeyIds)
      logger.log(`Key store initialized with GPG keys: ${gpgKeyIds.join(' ')}`);
    })

  program
    .command("create")
    .description("create a new encrypted secret")
    .argument("<name>", "Name of the secret to create")
    .argument("<value>", "Value of the secret to create")
    .action(async (name: string, value: string) => {
      const pass = new Pass(passPath)
      pass.insert(name, value)
      logger.log(`Secret '${name}' created successfully.`);
    })

  program
    .command("rm")
    .description("remove an encrypted secret")
    .argument("<name>", "Name of the secret to remove")
    .action(async (name: string) => {
      const pass = new Pass(passPath)
      pass.rm(name)
      logger.log(`Secret '${name}' removed successfully.`);
    })

  program
    .command("list")
    .description("List all encrypted secrets")
    .action(async () => {
      const pass = new Pass(passPath)
      logger.log("Available secrets:");
      logger.log(pass)
    });
}
