import { Command } from "commander";
import { registerL1 } from "./l1";
import { getConfig } from "./config";
import { generateClient } from "./client";

async function main() {
    const program = new Command();

    program
        .name('suzaku-cli')
        .description('CLI tool for Suzaku operations')
        .option('-k, --private-key <private-key>', 'The private key to use', process.env.PK)
        .option('-n, --network <network>', 'The network to use', 'fuji')
        .version('0.1.0');

    program
        .command('register-l1')
        .description('Register a new L1')
        .argument('validatorManager', 'The address of the validator manager')
        .argument('l1Middleware', 'The address of the L1 middleware')
        .argument('metadataUrl', 'The URL of the L1 metadata')
        .action(async (validatorManager, l1Middleware, metadataUrl) => {
            const config = getConfig(program.opts().network);
            const client = generateClient(program.opts().privateKey, program.opts().network);
            await registerL1(config, client, validatorManager, l1Middleware, metadataUrl);
        });

    program.parse();
}

main().catch(console.error);
