#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the mapping between contract names and their output files
const contractMappings = {
  'AvalancheL1Middleware': 'AvalancheL1Middleware.ts',
  'VaultTokenized': 'VaultTokenized.ts', 
  'L1Registry': 'L1Registry.ts',
  'L1RestakeDelegator': 'L1RestakeDelegator.ts',
  'MiddlewareVaultManager': 'MiddlewareVaultManager.ts',
  'OperatorL1OptInService': 'OperatorL1OptInService.ts',
  'OperatorRegistry': 'OperatorRegistry.ts',
  'OperatorVaultOptInService': 'OperatorVaultOptInService.ts',
  'Rewards': 'Rewards.ts',
  'UptimeTracker': 'UptimeTracker.ts',
  'VaultFactory': 'VaultFactory.ts',
  'BalancerValidatorManager': 'BalancerValidatorManager.ts'
};

// Source directory points to local suzaku-core repository (on size-middleware branch)
// The 'conflict-core2' directory name is the local checkout of suzaku-core
const sourceDir = path.resolve(__dirname, '../../conflict-core2/out');
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
    
    // Write the TypeScript file
    fs.writeFileSync(tsPath, tsContent);
    console.log(`✅ Updated: ${outputFileName}`);
    return true;
    
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
    if (updateAbiFile(contractName, outputFileName)) {
      updatedCount++;
    }
  }

  console.log(`\n📊 Summary: ${updatedCount}/${totalCount} ABI files updated successfully`);
  
  if (updatedCount === totalCount) {
    console.log('🎉 All ABI files updated successfully!');
  } else {
    console.log('⚠️  Some ABI files could not be updated. Check the logs above.');
  }
}

main(); 
