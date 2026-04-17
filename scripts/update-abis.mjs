#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toFunctionSelector } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetDir = path.resolve(__dirname, '../src/abis');

let abiSelectors = {};
if (fs.existsSync(path.join(targetDir, 'abi-selectors.json'))) {
  console.log("Using existing ABI selectors from src/abis/abi-selectors.json");
  abiSelectors = JSON.parse(fs.readFileSync(path.join(targetDir, 'abi-selectors.json')));
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
  KiteStakingManager: "KiteStakingManager.ts",
  StakingVault: "StakingVault.ts",
  StakingVaultOperations: "StakingVaultOperations.ts",
};

// Default source directory
const DEFAULT_SOURCE_DIR = "/home/gaetan/Documents/kite-ia/lst-kite/out";

// Parse CLI arguments for --source-dir or -s
function parseArgs() {
  const args = process.argv.slice(2);
  let sourceDirArg = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source-dir' || args[i] === '-s') {
      sourceDirArg = args[i + 1];
      break;
    }
    if (args[i].startsWith('--source-dir=')) {
      sourceDirArg = args[i].split('=')[1];
      break;
    }
  }

  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: update-abis.mjs [options]

Options:
  -s, --source-dir <path>  Path to the Foundry output directory containing ABIs
                           (default: ${DEFAULT_SOURCE_DIR})
  -h, --help               Show this help message
`);
    process.exit(0);
  }

  return sourceDirArg;
}

const sourceDirArg = parseArgs();
const sourceDir = path.resolve(sourceDirArg || DEFAULT_SOURCE_DIR);

console.log('🔄 Updating ABI files...');
console.log(`Source: ${sourceDir}`);
console.log(`Target: ${targetDir}`);

/**
 * Removes duplicate overloaded functions from an ABI, keeping only the one with the fewest parameters.
 * This helps avoid issues with viem's union type handling for overloaded functions.
 */
function deduplicateOverloadedFunctions(abi) {
  // Group functions by name
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

  // For each function name, keep only the one with the fewest inputs
  const deduplicatedFunctions = [];
  for (const [name, functions] of functionsByName) {
    if (functions.length === 1) {
      deduplicatedFunctions.push(functions[0]);
    } else {
      // Sort by number of inputs (ascending) and keep the first one
      functions.sort((a, b) => (a.inputs?.length || 0) - (b.inputs?.length || 0));
      const kept = functions[0];
      const removed = functions.slice(1);
      console.log(`  ⚡ Deduplicating "${name}": keeping ${kept.inputs?.length || 0} params, removing variants with ${removed.map(f => f.inputs?.length || 0).join(', ')} params`);
      deduplicatedFunctions.push(kept);
    }
  }

  return [...otherItems, ...deduplicatedFunctions];
}

function convertAbiToTypeScript(contractName, abi) {
  const tsContent = `export default ${JSON.stringify(abi, null, 4)} as const;\n`;
  return tsContent;
}

function updateAbiFile(contractName, outputFileName) {
  const jsonPath = path.join(sourceDir, `${contractName}.sol`, `${contractName}.json`);
  const tsPath = path.join(targetDir, outputFileName);

  let selectors = [];
  
  try {
    // Check if the source JSON file exists
    if (!fs.existsSync(jsonPath)) {
      console.log(`⚠️  Source file not found: ${jsonPath}`);
      return false;
    }

    // Read and parse the JSON file
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const contractData = JSON.parse(jsonContent);
    
    if (!contractData.abi) {
      console.log(`⚠️  No ABI found in ${jsonPath}`);
      return false;
    }

    // Deduplicate overloaded functions (keep only the one with fewest params)
    const deduplicatedAbi = deduplicateOverloadedFunctions(contractData.abi);

    // Convert to TypeScript format
    const tsContent = convertAbiToTypeScript(contractName, deduplicatedAbi);

    // process all functions and events selectors (to validate contract ABI on instantiation)
    selectors = contractData.abi.reduce((acc, item) => {
      if (item.type === 'function') {
        acc.push(toFunctionSelector(item).replace('0x', '').replace(/^(00)+/, ''));
      } else if (item.type === 'event') {
        // acc.push(toEventSelector(item).replace("0x", ""));
      }
      return acc;
    }, []);
    
    // Write the TypeScript file
    fs.writeFileSync(tsPath, tsContent);
    console.log(`✅ Updated: ${outputFileName}`);
    return new Set(selectors);
    
  } catch (error) {
    console.error(`❌ Error updating ${contractName}:`, error.message);
    return false;
  }
}

function main() {
  let updatedCount = 0;
  let totalCount = 0;

  // Check if source directory exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  // Check if target directory exists
  if (!fs.existsSync(targetDir)) {
    console.error(`❌ Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  // Update each contract
  for (const [contractName, outputFileName] of Object.entries(contractMappings)) {
    totalCount++;
    const contractSelectors = updateAbiFile(contractName, outputFileName);
    if (contractSelectors !== false) {
      abiSelectors[outputFileName.replace('.ts', '')] = [...contractSelectors];
      updatedCount++;
    }
  }

  // Write selectors to a JSON file for reference
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
