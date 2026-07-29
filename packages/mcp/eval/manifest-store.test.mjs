import { describe, expect, it } from 'vitest';
import { writeAttemptManifest } from './manifest-store.mjs';

function fakeFilesystem() {
  const directories = [];
  const files = [];
  return {
    directories,
    files,
    mkdirSync: (url) => directories.push(String(url)),
    writeFileSync: (url, contents) => files.push({ url: String(url), contents }),
  };
}

describe('attempt manifest placement', () => {
  const input = {
    tier: 2,
    argsValid: true,
    runId: 'run-1',
    serialized: '{"runId":"run-1"}\n',
    localDir: new URL('file:///tmp/eval/results/manifests/'),
    canonicalDir: new URL('file:///tmp/eval/manifests/'),
  };

  it('keeps exploratory and aborted attempts out of the canonical directory', () => {
    const filesystem = fakeFilesystem();
    const result = writeAttemptManifest({ ...input, commitReady: false }, filesystem);
    expect(result.destinations).toEqual({ local: true, canonical: false });
    expect(filesystem.files).toEqual([{
      url: 'file:///tmp/eval/results/manifests/run-1.json',
      contents: input.serialized,
    }]);
  });

  it('writes canonical manifests only for commit-ready benchmark batches', () => {
    const filesystem = fakeFilesystem();
    const result = writeAttemptManifest({ ...input, commitReady: true }, filesystem);
    expect(result.destinations).toEqual({ local: true, canonical: true });
    expect(filesystem.files.map((file) => file.url)).toEqual([
      'file:///tmp/eval/results/manifests/run-1.json',
      'file:///tmp/eval/manifests/run-1.json',
    ]);
  });

  it('writes no tier-2 artifact when argument validation never succeeded', () => {
    const filesystem = fakeFilesystem();
    const result = writeAttemptManifest({
      ...input, argsValid: false, commitReady: true,
    }, filesystem);
    expect(result.destinations).toEqual({ local: false, canonical: false });
    expect(filesystem.files).toEqual([]);
  });
});
