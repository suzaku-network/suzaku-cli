import { mkdirSync, writeFileSync } from 'node:fs';
import { manifestDestinations } from './reproducibility.mjs';

/** Shared manifest placement policy with injectable filesystem operations. */
export function writeAttemptManifest({
  tier,
  argsValid,
  commitReady,
  runId,
  serialized,
  localDir,
  canonicalDir,
}, filesystem = { mkdirSync, writeFileSync }) {
  const destinations = manifestDestinations({ tier, argsValid, commitReady });
  const written = [];
  if (!destinations.local) return { destinations, written };

  filesystem.mkdirSync(localDir, { recursive: true });
  const local = new URL(`./${runId}.json`, localDir);
  filesystem.writeFileSync(local, serialized);
  written.push({ kind: 'local', url: local });

  if (destinations.canonical) {
    filesystem.mkdirSync(canonicalDir, { recursive: true });
    const canonical = new URL(`./${runId}.json`, canonicalDir);
    filesystem.writeFileSync(canonical, serialized);
    written.push({ kind: 'canonical', url: canonical });
  }
  return { destinations, written };
}
