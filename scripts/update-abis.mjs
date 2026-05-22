#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toFunctionSelector } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_TARGET_DIR = path.resolve(__dirname, '../src/abis');
const SDK_CORE_DIR = path.resolve(__dirname, '../packages/suzaku-sdk/src/core');

// Maps output basename to SDK name (only when they differ)
const sdkNameOverrides = {
  KiteStaking: 'KiteStakingManager',
};

function getSdkName(outputFileName) {
  const baseName = outputFileName.replace('.ts', '');
  return sdkNameOverrides[baseName] ?? baseName;
}

// ── Source configurations ─────────────────────────────────────────────────────

const sources = [
  {
    sourceDir: "/home/gaetan/Documents/Suzaku/suzaku-deployments/suzaku-protocol/out",
    contractMappings: {
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
    },
  },
  {
    sourceDir: "/home/gaetan/Documents/kite-ia/lst-kite/out",
    contractMappings: {
      KiteStakingManager: "KiteStaking.ts",
      StakingVault: "StakingVault.ts",
      StakingVaultOperations: "StakingVaultOperations.ts",
    },
  },
];

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let targetDirArg = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target-dir' || args[i] === '-t') {
      targetDirArg = args[i + 1];
    } else if (args[i].startsWith('--target-dir=')) {
      targetDirArg = args[i].split('=')[1];
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: update-abis.mjs [options]

Options:
  -t, --target-dir <path>  Path to the CLI output directory for generated ABI TypeScript files
                           (default: ${DEFAULT_TARGET_DIR})
  -h, --help               Show this help message

Source directories and contract mappings are configured inside the script (sources array).
`);
    process.exit(0);
  }

  return { targetDirArg };
}

// ── Extra error merges ────────────────────────────────────────────────────────
// Maps output folder name → list of folder names whose errors.ts to also import.
// Each contract always auto-imports its own errors.ts (if it has errors).
// Add entries here to pull in external contract errors for better revert decoding.

const extraErrorMerges = {
  BalancerValidatorManager: ['ValidatorManager'],
  KiteStaking: ['ValidatorManager'],
  StakingVault: ['KiteStaking'],
};

// ── ABI generation helpers ────────────────────────────────────────────────────

function deduplicateOverloadedFunctions(abi) {
  const functionsByName = new Map();
  const otherItems = [];

  for (const item of abi) {
    if (item.type === 'function') {
      const name = item.name;
      if (!functionsByName.has(name)) functionsByName.set(name, []);
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

// errors.ts: owns errors + transitively merged errors from dependencies
function generateErrorsContent(ownErrors, sdkName, extraErrorFolders = []) {
  const importLines = extraErrorFolders.map(n => `import ${n}Errors from '../${n}/errors';`);
  const extraSpreads = extraErrorFolders.map(n => `...${n}Errors`);
  const importsSection = importLines.length > 0 ? importLines.join('\n') + '\n\n' : '';

  let decls;
  if (ownErrors.length > 0 && extraSpreads.length > 0) {
    const ownJson = JSON.stringify(ownErrors, null, 4);
    decls = `const ownErrors = ${ownJson} as const;\nconst errors = [...ownErrors, ${extraSpreads.join(', ')}] as const;`;
  } else if (ownErrors.length > 0) {
    decls = `const errors = ${JSON.stringify(ownErrors, null, 4)} as const;`;
  } else {
    decls = `const errors = [${extraSpreads.join(', ')}] as const;`;
  }

  return `${importsSection}${decls}\n\nexport type T${sdkName}Errors = typeof errors;\nexport default errors;\n`;
}

// abi.ts: base ABI (no errors) + only its own errors.ts
function generateSdkAbiContent(baseAbi, sdkName, hasErrors) {
  const fnName = `get${sdkName}`;
  const baseAbiJson = JSON.stringify(baseAbi, null, 4);

  const importsSection = hasErrors ? `\nimport errors from './errors';\n` : '';
  const abiDecl = hasErrors
    ? `const baseAbi = ${baseAbiJson} as const;\nconst abi = [...baseAbi, ...errors] as const;\n(abi as any).contractName = '${sdkName}';`
    : `const abi = ${baseAbiJson} as const;\n(abi as any).contractName = '${sdkName}';`;

  return `import type { Address } from 'viem';
import { getContract } from '../client/viemUtils';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { EnhancedContract, SafeEnhancedContract } from '../client/viemUtils';
import { selectors } from './selectors';
${importsSection}
${abiDecl}

export async function ${fnName}<C extends ExtendedClient>(
  client: C,
  address?: Address,
): Promise<C extends ExtendedWalletClient ? SafeEnhancedContract<typeof abi, C> : EnhancedContract<typeof abi, C>> {
  return getContract(abi, '${sdkName}', client, address, selectors);
}

export type T${sdkName}ABI = typeof abi;
export default abi;
`;
}

function updateAbiFile(sourceDir, contractName, outputFileName, targetDir, extraErrorFolders = []) {
  const sdkName = getSdkName(outputFileName);
  const outputBaseName = outputFileName.replace('.ts', '');
  const jsonPath = path.join(sourceDir, `${contractName}.sol`, `${contractName}.json`);
  const tsPath = path.join(targetDir, outputFileName);

  try {
    if (!fs.existsSync(jsonPath)) {
      console.log(`⚠️  Source file not found: ${jsonPath}`);
      return false;
    }

    const contractData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!contractData.abi) {
      console.log(`⚠️  No ABI found in ${jsonPath}`);
      return false;
    }

    const deduplicatedAbi = deduplicateOverloadedFunctions(contractData.abi);
    const errors = deduplicatedAbi.filter(item => item.type === 'error');
    const baseAbi = deduplicatedAbi.filter(item => item.type !== 'error');

    // CLI ABI file (full ABI, unchanged)
    fs.writeFileSync(tsPath, `export default ${JSON.stringify(deduplicatedAbi, null, 4)} as const;\n`);
    console.log(`✅ Updated CLI: ${outputFileName}`);

    // Selectors
    const selectors = contractData.abi.reduce((acc, item) => {
      if (item.type === 'function') {
        acc.push(toFunctionSelector(item).replace('0x', '').replace(/^(00)+/, ''));
      }
      return acc;
    }, []);

    // SDK contract folder
    const contractFolder = path.join(SDK_CORE_DIR, outputBaseName);
    if (fs.existsSync(SDK_CORE_DIR)) {
      fs.mkdirSync(contractFolder, { recursive: true });

      const hasAnyErrors = errors.length > 0 || extraErrorFolders.length > 0;
      if (hasAnyErrors) {
        fs.writeFileSync(path.join(contractFolder, 'errors.ts'), generateErrorsContent(errors, sdkName, extraErrorFolders));
      }
      fs.writeFileSync(path.join(contractFolder, 'abi.ts'), generateSdkAbiContent(baseAbi, sdkName, hasAnyErrors));
      fs.writeFileSync(path.join(contractFolder, 'selectors.ts'), `export const selectors = ${JSON.stringify(selectors)} as const;\n`);

      const indexPath = path.join(contractFolder, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, `export { default as ${sdkName}ABI, get${sdkName}, T${sdkName}ABI } from './abi';\nexport * from './selectors';\n`);
      }

      console.log(`✅ Updated SDK: ${outputBaseName}/`);
    }

    return new Set(selectors);
  } catch (error) {
    console.error(`❌ Error updating ${contractName}:`, error.message);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const { targetDirArg } = parseArgs();
  const targetDir = path.resolve(targetDirArg || DEFAULT_TARGET_DIR);

  let abiSelectors = {};
  const selectorsPath = path.join(targetDir, 'abi-selectors.json');
  if (fs.existsSync(selectorsPath)) {
    console.log("Using existing ABI selectors from src/abis/abi-selectors.json");
    abiSelectors = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'));
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`📁 Created target directory: ${targetDir}`);
  }

  console.log('🔄 Updating ABI files...');
  console.log(`Target (CLI): ${targetDir}`);
  console.log(`Target (SDK): ${SDK_CORE_DIR}/<ContractFolder>/`);

  let updatedCount = 0;
  let totalCount = 0;

  for (const { sourceDir, contractMappings } of sources) {
    console.log(`\n📂 Source: ${sourceDir}`);

    if (!fs.existsSync(sourceDir)) {
      console.error(`❌ Source directory not found: ${sourceDir}`);
      continue;
    }

    for (const [contractName, outputFileName] of Object.entries(contractMappings)) {
      totalCount++;
      const outputBaseName = outputFileName.replace('.ts', '');
      const extraErrorFolders = extraErrorMerges[outputBaseName] ?? [];
      const contractSelectors = updateAbiFile(sourceDir, contractName, outputFileName, targetDir, extraErrorFolders);
      if (contractSelectors !== false) {
        abiSelectors[outputBaseName] = [...contractSelectors];
        updatedCount++;
      }
    }
  }

  fs.writeFileSync(selectorsPath, JSON.stringify(abiSelectors, null, 4));
  console.log(`\n✅ ABI selectors written to: abi-selectors.json`);
  console.log(`📊 Summary: ${updatedCount}/${totalCount} ABI files updated successfully`);

  if (updatedCount === totalCount) {
    console.log('🎉 All ABI files updated successfully!');
  } else {
    console.log('⚠️  Some ABI files could not be updated. Check the logs above.');
  }
}

main();
