#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toFunctionSelector } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_TARGET_DIR = path.resolve(__dirname, '../src/abis');
const SDK_CORE_DIR = path.resolve(__dirname, '../packages/suzaku-sdk/src/core');

let abiSelectors = {};
if (fs.existsSync(path.join(DEFAULT_TARGET_DIR, 'abi-selectors.json'))) {
  console.log("Using existing ABI selectors from src/abis/abi-selectors.json");
  abiSelectors = JSON.parse(fs.readFileSync(path.join(DEFAULT_TARGET_DIR, 'abi-selectors.json')));
}

const selectorUpdated = Object.keys(abiSelectors).length > 0;

// Define the mapping between contract names and their output files
const contractMappings = {
  AvalancheL1Middleware: "L1Middleware.ts",
  VaultTokenized: "VaultTokenized.ts",
  DefaultCollateral: "DefaultCollateral.ts",
  TestERC20: "ERC20.ts",
  L1Registry: "L1Registry.ts",
  L1RestakeDelegator: "L1RestakeDelegator.ts",
  MiddlewareVaultManager: "VaultManager.ts",
  OperatorL1OptInService: "OperatorL1OptInService.ts",
  OperatorRegistry: "OperatorRegistry.ts",
  OperatorVaultOptInService: "OperatorVaultOptInService.ts",
  PoASecurityModule: "PoASecurityModule.ts",
  UptimeTracker: "UptimeTracker.ts",
  VaultFactory: "VaultFactory.ts",
  BalancerValidatorManager: "BalancerValidatorManager.ts",
  IWarpMessenger: "IWarpMessenger.ts",
  ValidatorManager: "ValidatorManager.ts",
  AccessControl: "AccessControl.ts",
  RewardsNativeToken: "RewardsNativeToken.ts",
  Ownable: "Ownable.ts",
  KiteStaking: "KiteStaking.ts",
  StakingVault: "StakingVault.ts",
  StakingVaultOperations: "StakingVaultOperations.ts",
};

// Maps output basename to SDK name (only when they differ)
const sdkNameOverrides = {
  KiteStaking: 'KiteStakingManager',
};

function getSdkName(outputFileName) {
  const baseName = outputFileName.replace('.ts', '');
  return sdkNameOverrides[baseName] ?? baseName;
}

// Default source directory
const DEFAULT_SOURCE_DIR = "/home/gaetan/Documents/kite-ia/lst-kite/out";

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let sourceDirArg = null;
  let targetDirArg = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source-dir' || args[i] === '-s') {
      sourceDirArg = args[i + 1];
    } else if (args[i].startsWith('--source-dir=')) {
      sourceDirArg = args[i].split('=')[1];
    } else if (args[i] === '--target-dir' || args[i] === '-t') {
      targetDirArg = args[i + 1];
    } else if (args[i].startsWith('--target-dir=')) {
      targetDirArg = args[i].split('=')[1];
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: update-abis.mjs [options]

Options:
  -s, --source-dir <path>  Path to the Foundry output directory containing ABIs
                           (default: ${DEFAULT_SOURCE_DIR})
  -t, --target-dir <path>  Path to the CLI output directory for generated ABI TypeScript files
                           (default: ${DEFAULT_TARGET_DIR})
  -h, --help               Show this help message
`);
    process.exit(0);
  }

  return { sourceDirArg, targetDirArg };
}

const { sourceDirArg, targetDirArg } = parseArgs();
const sourceDir = path.resolve(sourceDirArg || DEFAULT_SOURCE_DIR);
const targetDir = path.resolve(targetDirArg || DEFAULT_TARGET_DIR);

console.log('🔄 Updating ABI files...');
console.log(`Source: ${sourceDir}`);
console.log(`Target (CLI): ${targetDir}`);
console.log(`Target (SDK): ${SDK_CORE_DIR}/<ContractFolder>/`);

/**
 * Removes duplicate overloaded functions from an ABI, keeping only the one with the fewest parameters.
 */
function deduplicateOverloadedFunctions(abi) {
  const functionsByName = new Map();
  const otherItems = [];

  for (const item of abi) {
    if (item.type === 'function') {
      const name = item.name;
      if (!functionsByName.has(name)) {
        functionsByName.set(name, []);
      }
      functionsByName.get(name).push(item);
    } else {
      otherItems.push(item);
    }
  }

  const deduplicatedFunctions = [];
  for (const [name, functions] of functionsByName) {
    if (functions.length === 1) {
      deduplicatedFunctions.push(functions[0]);
    } else {
      functions.sort((a, b) => (a.inputs?.length || 0) - (b.inputs?.length || 0));
      const kept = functions[0];
      const removed = functions.slice(1);
      console.log(`  ⚡ Deduplicating "${name}": keeping ${kept.inputs?.length || 0} params, removing variants with ${removed.map(f => f.inputs?.length || 0).join(', ')} params`);
      deduplicatedFunctions.push(kept);
    }
  }

  return [...otherItems, ...deduplicatedFunctions];
}

function generateSdkAbiContent(abi, sdkName, selectors) {
  const fnName = `get${sdkName}`;
  const abiJson = JSON.stringify(abi, null, 4);
  const selectorsJson = JSON.stringify(selectors);
  return `import type { Address } from 'viem';
import { getContract } from '../client/viemUtils';
import type { Config } from '../config';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { EnhancedContract, SafeEnhancedContract } from '../client/viemUtils';
import { selectors } from './selectors';

const abi = ${abiJson} as const;
export default abi;

export async function ${fnName}<C extends ExtendedClient>(
  config: Config<C>,
  address?: Address,
): Promise<C extends ExtendedWalletClient ? SafeEnhancedContract<typeof abi, C> : EnhancedContract<typeof abi, C>> {
  return getContract(abi, '${sdkName}', config, address, selectors) as any;
  // as any: TypeScript cannot resolve conditional return type from a generic function
}
`;
}

function updateAbiFile(contractName, outputFileName) {
  const jsonPath = path.join(sourceDir, `${contractName}.sol`, `${contractName}.json`);
  const tsPath = path.join(targetDir, outputFileName);

  try {
    if (!fs.existsSync(jsonPath)) {
      console.log(`⚠️  Source file not found: ${jsonPath}`);
      return false;
    }

    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const contractData = JSON.parse(jsonContent);

    if (!contractData.abi) {
      console.log(`⚠️  No ABI found in ${jsonPath}`);
      return false;
    }

    const deduplicatedAbi = deduplicateOverloadedFunctions(contractData.abi);

    // Write CLI ABI file (simple export default)
    const cliContent = `export default ${JSON.stringify(deduplicatedAbi, null, 4)} as const;\n`;
    fs.writeFileSync(tsPath, cliContent);
    console.log(`✅ Updated CLI: ${outputFileName}`);

    // Compute selectors
    const selectors = contractData.abi.reduce((acc, item) => {
      if (item.type === 'function') {
        acc.push(toFunctionSelector(item).replace('0x', '').replace(/^(00)+/, ''));
      }
      return acc;
    }, []);

    // Write SDK contract folder files
    const outputBaseName = outputFileName.replace('.ts', '');
    const sdkName = getSdkName(outputFileName);
    const contractFolder = path.join(SDK_CORE_DIR, outputBaseName);
    if (fs.existsSync(SDK_CORE_DIR)) {
      fs.mkdirSync(contractFolder, { recursive: true });

      // abi.ts
      fs.writeFileSync(
        path.join(contractFolder, 'abi.ts'),
        generateSdkAbiContent(deduplicatedAbi, sdkName, selectors),
      );

      // selectors.ts
      fs.writeFileSync(
        path.join(contractFolder, 'selectors.ts'),
        `export const selectors = ${JSON.stringify(selectors)} as const;\n`,
      );

      // index.ts — only if it doesn't already exist
      const indexPath = path.join(contractFolder, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(
          indexPath,
          `export { default as ${sdkName}ABI, get${sdkName} } from './abi';\nexport * from './selectors';\n`,
        );
      }

      console.log(`✅ Updated SDK: ${outputBaseName}/`);
    }

    return new Set(selectors);

  } catch (error) {
    console.error(`❌ Error updating ${contractName}:`, error.message);
    return false;
  }
}

function main() {
  let updatedCount = 0;
  let totalCount = 0;

  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`📁 Created target directory: ${targetDir}`);
  }

  for (const [contractName, outputFileName] of Object.entries(contractMappings)) {
    totalCount++;
    const contractSelectors = updateAbiFile(contractName, outputFileName);
    if (contractSelectors !== false) {
      abiSelectors[outputFileName.replace('.ts', '')] = [...contractSelectors];
      updatedCount++;
    }
  }

  // Write CLI selectors JSON
  const selectorsPath = path.join(targetDir, 'abi-selectors.json');
  fs.writeFileSync(selectorsPath, JSON.stringify(abiSelectors, null, 4));
  console.log(`✅ ABI selectors ${selectorUpdated ? 'updated' : 'written'} to: abi-selectors.json`);

  console.log(`\n📊 Summary: ${updatedCount}/${totalCount} ABI files updated successfully`);

  if (updatedCount === totalCount) {
    console.log('🎉 All ABI files updated successfully!');
  } else {
    console.log('⚠️  Some ABI files could not be updated. Check the logs above.');
  }
}

main();
