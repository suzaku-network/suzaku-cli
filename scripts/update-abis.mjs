#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toFunctionSelector, toEventSelector } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  Ownable: "Ownable.ts"
};

// Source directory points to local suzaku-core repository (on size-middleware branch)
// The 'conflict-core2' directory name is the local checkout of suzaku-core
const sourceDir = path.resolve(
  __dirname,
  "../../suzaku-deployments/suzaku-protocol/out"
);
const targetDir = path.resolve(__dirname, '../src/abis');

console.log('🔄 Updating ABI files...');
console.log(`Source: ${sourceDir}`);
console.log(`Target: ${targetDir}`);

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

    // Convert to TypeScript format
    const tsContent = convertAbiToTypeScript(contractName, contractData.abi);

    // process all functions and events selectors (to validate contract ABI on instantiation)
    selectors = contractData.abi.reduce((acc, item) => {
      if (item.type === 'function') {
        acc.push(toFunctionSelector(item).replace('0x', ''));
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

  let selectors = {};

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
    if (
      (selectors[outputFileName.replace('.ts', '')] = [...updateAbiFile(contractName, outputFileName)])
    ) {
      updatedCount++;
    }
  }

  // Write selectors to a JSON file for reference
  const selectorsPath = path.join(targetDir, 'abi-selectors.json');
  fs.writeFileSync(selectorsPath, JSON.stringify(selectors, null, 4));
  console.log(`✅ ABI selectors written to: abi-selectors.json`);

  console.log(`\n📊 Summary: ${updatedCount}/${totalCount} ABI files updated successfully`);
  
  if (updatedCount === totalCount) {
    console.log('🎉 All ABI files updated successfully!');
  } else {
    console.log('⚠️  Some ABI files could not be updated. Check the logs above.');
  }
}

main();
