import L1RegistryAbi from './abis/L1Registry.json';

interface Config {
    l1Registry: `0x${string}`;
    abis: {
        L1Registry: any;
    }
}

const fujiConfig: Config = {
    l1Registry: '0xf79bDf6582F5180679465Ec0bf8B2dA5B2B1B0E0',
    abis: {
        L1Registry: L1RegistryAbi,
    }
}

const anvilConfig: Config = {
    l1Registry: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
    abis: {
        L1Registry: L1RegistryAbi,
    }
}

function getConfig(network: string): Config {
    if (network === 'fuji') {
        return fujiConfig;
    } else if (network === 'anvil') {
        return anvilConfig;
    } else {
        throw new Error(`Unsupported network: ${network}`);
    }
}

export { Config, getConfig };
