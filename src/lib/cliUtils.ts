import { spawnSync } from "child_process";

export function getClipboardValue(): string {
  let result: string;
  const platform = process.platform;

  if (platform === 'win32') {
    // Windows
    result = spawnSync('powershell', ['-command', 'Get-Clipboard'], { encoding: 'utf-8', shell: false }).stdout;
  } else if (platform === 'darwin') {
    // macOS
    result = spawnSync('pbpaste', [], { encoding: 'utf-8', shell: false }).stdout;
  } else {
    // Linux and others
    result = spawnSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf-8', shell: false }).stdout;
  }

  return result.trim();
}

export function setClipboardValue(value: string): void {
  const platform = process.platform;

  if (platform === 'win32') {
    // Windows
    spawnSync('powershell', ['-command', `Set-Clipboard -Value "${value.replace(/"/g, '""')}"`], { encoding: 'utf-8', shell: false });
  } else if (platform === 'darwin') {
    // macOS
    spawnSync('pbcopy', [], { input: value, encoding: 'utf-8', shell: false });
  } else {
    // Linux and others
    spawnSync('echo ' + value + ' | xclip -selection clipboard', { encoding: 'utf-8', shell: false });
  }
}

import * as readline from 'readline';

export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
