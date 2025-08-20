import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import { color } from 'console-log-colors';

// Tree representation type
type Tree = { [key: string]: Tree | undefined };

/** Recursively builds the Tree representation of dirPath. */
function buildTree(dirPath: string, extensions: string[] = ['gpg']): Tree {
  const node: Tree = {};
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      node[entry] = buildTree(fullPath);
    } else if (extensions.length === 0 || extensions.some(ext => entry.endsWith(`.${ext}`))) {
      node[entry] = undefined;
    }
  }
  return node;
}

function printTree(baseName: string, tree: Tree): string {
  
  const lines: string[] = [color.blue(baseName)];

  const buildLines = (node: Tree, prefix: string) => {
    const keys = Object.keys(node);
    keys.forEach((key, i) => {
      const isLast = i === keys.length - 1;
      const child = node[key];
      const displayedKey = (child ? color.blue(key) : key).replace(/\.gpg$/, ''); // Remove .gpg extension for display
      lines.push(
        `${prefix}${isLast ? '└── ' : '├── '}${displayedKey}`
      );
      
      if (child) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        buildLines(child, newPrefix);
      }
    });
  };

  buildLines(tree, '');
  return lines.join('\n');
}

/** Retrieves a subtree at the given relative path, or undefined if not found. */
const getNode = (node: Tree, parts: string[]): Tree | undefined => {
  if (parts.length === 0) return node;
  const [head, ...rest] = parts;
  const child = node[head];
  if (!child) return undefined;
  return getNode(child, rest);
}

function getSubTree(tree: Tree, relativePath: string): Tree | undefined {
  const parts = relativePath.split(path.sep).filter(Boolean);
  return getNode(tree, parts);
}

// Option types for PassWrapperSync

type ShowOptions = {
  clipLine?: number;
};

type InsertOptions = {
  multiline?: boolean;
  force?: boolean;
};

type GenerateOptions = {
  length?: number;
  noSymbols?: boolean;
  clip?: boolean;
  inPlace?: boolean;
  force?: boolean;
};

type RmOptions = {
  recursive?: boolean;
  force?: boolean;
};

type MvCpOptions = {
  force?: boolean;
};

// proxy for Pass to add a relative path layer
const getPassProxyHandler = (relPath: string): ProxyHandler<Pass> => {
  // Create a handler that modifies the arguments based on the relative path for each function
  const simpleMethods: string[] = ['ls', 'show', 'insert', 'edit', 'generate', 'rm', 'toString'];
  const complexMethods: string[] = ['mv', 'cp'];
  const handler: ProxyHandler<any> = {
    apply(target: Function, thisArg: any, argArray: any[]) {
      const args = argArray;
      if (!complexMethods.includes(target.name)) {
        args[0] = args[0] && typeof args[0] === 'string' ? path.join(relPath, path.sep, args[0]) : relPath;
      } else {
        if (args.length < 2) {
          throw new Error(`Method ${target.name} requires at least 2 arguments.`);
        }
        args[0] = args[0] && typeof args[0] === 'string' ? path.join(relPath, path.sep, args[0]) : relPath;
        args[1] = args[1] && typeof args[1] === 'string' ? path.join(relPath, path.sep, args[1]) : relPath;
      }
      return target.apply(thisArg, args);
    }
  }
  // Return a Proxy handler for the Pass instance that intercepts property access (functions in our cases)
  return {
    get(target: any, prop: string) {
      if (simpleMethods.includes(prop)) {
        return new Proxy(Reflect.get(target, prop), handler)
      } else return Reflect.get(target, prop);
    }
  }
}

/**
 * Synchronous TypeScript wrapper around `pass` CLI.
 * Returns SubPass when path refers to directory.
 */
export class Pass {
  private passBin = 'pass';
  public storeDir: string;
  private tree: Tree;

  /**
   * @param storePath Absolute path to password-store directory.
   * @param initOptions Provide GPG IDs to initialize if store missing.
   */
  constructor(storePath?: string, gpgIds?: string[]) {
    if (storePath) {
      if (!path.isAbsolute(storePath)) {
        throw new Error('A valid absolute storePath is required.');
      }
      this.storeDir = storePath;
      // Set PASSWORD_STORE_DIR environment variable for all subsequent commands
      process.env.PASSWORD_STORE_DIR = this.storeDir;
    } else {
      this.storeDir = process.env.PASSWORD_STORE_DIR || path.join(os.homedir(), '.password-store');
    }
    // Ensure the store directory exists
    if (!fs.existsSync(this.storeDir)) {
      if (gpgIds && gpgIds.length > 0) {
        console.log(`Store directory ${this.storeDir} does not exist. Initializing with GPG IDs: ${gpgIds.join(', ')}`);
        this.init(gpgIds);
      } else {
        throw new Error(`Password store directory ${this.storeDir} does not exist. Please initialize it first.`);
      }
    } else if (!fs.statSync(this.storeDir).isDirectory()) {
      throw new Error(`Password store path ${this.storeDir} is not a directory.`);
    }
    // Build SubPass for store
    this.tree = buildTree(this.storeDir);
    try {
      this.version()
    } catch {
      throw new Error('`pass` CLI is not installed or not in PATH. pls visit https://www.passwordstore.org/ to install it.');
    }
  }

  private refresh(): void {
    this.tree = buildTree(this.storeDir);
  }

    /** Run a command in the context of the store and return stdout as string (trimmed). */
  private run(cmd: string): string {
    try {
      const out = execSync(cmd, {
        stdio: ['ignore', 'pipe', 'inherit'],
        env: process.env,
        // cwd: this.storeDir,
      }).toString()
        .replace(/\x1b\[[0-9;]*m/g, ''); // Remove ANSI color codes
      return out.trim();
    } catch (error) {
      if (cmd.includes('show') || cmd.includes('insert')) {// Hide secrets
        throw new Error(`Command failed: ${(error as Error).message}`);
      } else {
        throw error
      }
    }
  }

  static listGPGIds(): string[] {
    const cmd = `gpg -k | grep '^uid' | sed 's/.*<\\([^>]*\\)>.*/\\1/p'`;
    const out = execSync(cmd , {
      stdio: ['ignore', 'pipe', 'inherit']
    }).toString()
    return [...new Set(out.split('\n').map(line => line.trim()).filter(line => !!line))];
  }

  /** Initialize a new password store: pass init gpg-id... */
  init(gpgIds: string[]): void {
    if (!gpgIds.length) throw new Error('At least one GPG ID is required for init.');
    this.run(`${this.passBin} init ${gpgIds.join(' ') }`);
  }

  /** List entries or return SubPass if subfolder path.
   * @returns string[] or SubPass
   */
  ls(subfolder = '') {
    return new Proxy(this, getPassProxyHandler(subfolder));
  }

  /** Show entry or return SubPass if name path is directory.
   * @returns string or SubPass
   */
  show(name?: string, options: ShowOptions = {}): string | Pass {
    const fullDir = name ? path.join(this.storeDir, name) : this.storeDir;
    if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) return name ? new Proxy(this, getPassProxyHandler(name)) : this;
    const clipFlag = options.clipLine !== undefined ? `--clip=${options.clipLine}` : '';
    const cmd = `${this.passBin} show ${clipFlag} ${name}`.trim();
    return this.run(cmd);
  }

  /** Search decrypted contents: pass grep [options] search-string */
  grep(searchString: string, grepOptions = ''): string[] {
    const opts = grepOptions ? `${grepOptions}` : '';
    const cmd = `${this.passBin} grep ${opts} ${searchString}`.trim();
    const out = this.run(cmd);
    return out.split('\n').map(line => line.trim()).filter(line => !!line);
  }

  /** Insert or edit an entry: pass insert [--echo | --multiline] [--force] pass-name */
  insert(name: string, secret: string, options: InsertOptions = {}): void {
    const flags: string[] = [];
    if (options.multiline) flags.push('--multiline');
    if (options.force) flags.push('--force');
    const flagStr = flags.join(' ');
    const cmd = `echo "${secret.replace(/"/g, '\\"')}" | ${this.passBin} insert -e ${flagStr} ${name}`;
    this.run(cmd);
    this.refresh()
  }

  /** Edit an entry using system $EDITOR: pass edit pass-name */
  edit(name: string): void {
    this.run(`${this.passBin} edit ${name}`);
    this.refresh()
  }

  /**
   * Generate a password: pass generate [--no-symbols] [--clip] [--in-place | --force] pass-name [length]
   * Returns generated password or SubPass if path exists and is directory.
   */
  generate(name: string, options: GenerateOptions = {}): string {
    const flags: string[] = [];
    if (options.noSymbols) flags.push('--no-symbols');
    if (options.clip) flags.push('--clip');
    if (options.inPlace) flags.push('--in-place');
    if (options.force) flags.push('--force');
    const length = options.length || 25;
    const flagStr = flags.join(' ');
    const cmd = `${this.passBin} generate ${flagStr} ${name} ${length}`.trim();
    this.run(cmd);
    this.refresh()
    const entry = this.show(name) as string;
    const firstLine = entry.split('\n')[0].trim();
    return firstLine;
  }

  /** Remove an entry or directory: pass rm [--recursive] [--force] pass-name */
  rm(name: string, options: RmOptions = {}): void {
      // Remove entire directory
      const flags: string[] = [];
      if (options.recursive) flags.push('--recursive');
      if (options.force) flags.push('--force');
      const flagStr = flags.join(' ');
      const cmd = `${this.passBin} rm ${flagStr} ${name}`.trim();
      this.run(cmd);
    this.refresh()
  }

  /** Move or rename: pass mv [--force] old-path new-path */
  mv(oldPath: string, newPath: string, options: MvCpOptions = {}): void {
      const flag = options.force ? '--force' : '';
      const cmd = `${this.passBin} mv ${flag} ${oldPath} ${newPath}`.trim();
      this.run(cmd);
    this.refresh()
  }

  /** Copy an entry: pass cp [--force] old-path new-path */
  cp(oldPath: string, newPath: string, options: MvCpOptions = {}): void {
      const flag = options.force ? '--force' : '';
      const cmd = `${this.passBin} cp ${flag} ${oldPath} ${newPath}`.trim();
      this.run(cmd);
    this.refresh()
  }

  /** Execute a git command in the store: pass git git-command-args... */
  git(args: string[]): string {
    if (!args.length) {
      throw new Error('At least one git argument is required.');
    }
    const argStr = args.join(' ');
    const cmd = `${this.passBin} git ${argStr}`.trim();
    return this.run(cmd);
  }

  /** Show help text: pass help */
  help(): string {
    return this.run(`${this.passBin} help`);
  }

  /** Show version info: pass version */
  version(): string {
    return this.run(`${this.passBin} version`).match(/(\d+\.\d+\.\d+)/)?.[0] || 'unknown';
  }

  toString(name?: string): string {
    const baseName = name ? path.basename(name) : path.basename(this.storeDir);
    return printTree(baseName, (name ? getSubTree(this.tree, name)! : this.tree));
  }

  /** Custom inspect method for better console output (auto call toString when console.log the object) */
  [util.inspect.custom](_depth: number, _opts: util.InspectOptions): string {
    return this.toString();
  }
}


// const pass = new Pass(path.join(os.homedir(), path.sep, '/Documents/temp/.passwd-store'), [Pass.listGPGIds()[0]]);
// pass.generate('email/github', { length: 32});
// pass.insert('email/gitlab', 'MyP@ssw0rd');
// pass.insert('email/test/test2', 'MyP@ssw0rd');
// pass.insert('email/test/test3', 'MyP@ssw0rd');

// const testKeystore = pass.ls('email/test');
// console.log(pass)
// console.log(testKeystore)

// console.log(pass.version());
// console.log(pass.ls());
// console.log(pass.show('email/gitlab'));

// console.log(pass.ls('email'));
// console.log(pass.show('email'));

// pass.rm('email/gitlab');

// console.log(pass.show());
// console.log(Pass.listGPGIds())
