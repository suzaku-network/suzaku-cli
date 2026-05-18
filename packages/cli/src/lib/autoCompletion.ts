import fs from "fs";
import os from "os";
import path from "path";
import { Command } from '@commander-js/extra-typings';

function getShell() {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  return "bash";
}

function collectTree(cmd: Command): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  function walk(node: Command, prefix: string) {
    const children = node.commands as Command[];
    if (children.length === 0) return;
    result[prefix] = children.map(c => c.name());
    for (const child of children) {
      const childPrefix = prefix ? `${prefix} ${child.name()}` : child.name();
      walk(child, childPrefix);
    }
  }

  walk(cmd, "");
  return result;
}

export function generateCompletion(program: Command): string {
  const cli = program.name();
  const tree = collectTree(program);

  const cases = Object.entries(tree)
    .map(([key, children]) => `    "${key}") suggestions="${children.join(" ")}" ;;`)
    .join("\n");

  return `
_${cli}_completions() {
  local cur i key=""
  cur="\${COMP_WORDS[COMP_CWORD]}"

  for ((i=1; i<COMP_CWORD; i++)); do
    [ -n "\$key" ] && key="\$key \${COMP_WORDS[\$i]}" || key="\${COMP_WORDS[\$i]}"
  done

  local suggestions=""
  case "\$key" in
${cases}
    *) suggestions="" ;;
  esac

  COMPREPLY=( \$(compgen -W "\${suggestions}" -- "\${cur}") )
}

complete -F _${cli}_completions ${cli}
`.trim();
}

export async function installCompletion(program: Command) {
  const shell = getShell();
  const folder =
    shell === "zsh"
      ? path.join(os.homedir(), `.oh-my-zsh/custom/plugins/${program.name()}`)
      : path.join(os.homedir(), ".bash_completion.d");

  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, program.name() + (shell === "zsh" ? ".plugin.zsh" : ".bash"));

  fs.writeFileSync(file, generateCompletion(program), "utf8");

  const rcFile = path.join(os.homedir(), `.${shell}rc`);
  if (fs.existsSync(rcFile)) {
    const bashrcContent = fs.readFileSync(rcFile, "utf8");
    const sourceLine = `source ${file}`;
    if (!bashrcContent.includes(sourceLine)) {
      fs.appendFileSync(rcFile, `\n# Suzaku CLI completion\n${sourceLine}\n`, "utf8");
    }
  }

  console.log(`✅ Auto-completion ${shell} installed : ${file}`);
  console.log("⚠️ Restart your terminal or :");
  console.log(`  source ${file}`);
}
