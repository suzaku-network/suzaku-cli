import { Command } from '@commander-js/extra-typings';
import { Pass } from "./lib/pass";
import { confPath } from './config';

export const passPath = confPath + '/.password-store'

export function buildCommands(program: Command) {
  program
    .command("list-gpg-ids")
    .description("List available gpg key ids installed on the system")
    .action(async () => console.log(Pass.listGPGIds()))

  program
    .command("init")
    .description("Initialize the keystore")
    .argument("<gpgKeyIds...>", "desired gpg key ids used to encrypt/decrypt the key store")
    .action(async (gpgKeyIds: string[]) => {
      const pass = new Pass(passPath, gpgKeyIds)
      console.log(`Key store initialized with GPG keys: ${gpgKeyIds.join(' ')}`);
    })

  program
    .command("create")
    .description("create a new encrypted secret")
    .argument("<name>", "Name of the secret to create")
    .argument("<value>", "Value of the secret to create")
    .action(async (name, value) => {
      const pass = new Pass(passPath)
      pass.insert(name, value)
      console.log(`Secret '${name}' created successfully.`);
    })

  program
    .command("rm")
    .description("remove an encrypted secret")
    .argument("<name>", "Name of the secret to remove")
    .action(async (name) => {
      const pass = new Pass(passPath)
      pass.rm(name)
      console.log(`Secret '${name}' removed successfully.`);
    })

  program
    .command("list")
    .description("List all encrypted secrets")
    .action(async () => {
      const pass = new Pass(passPath)
      console.log("Available secrets:");
      console.log(pass)
    });
}
