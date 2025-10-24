import fs from "fs";
import os from "os";
import path from "path";
import { Command } from '@commander-js/extra-typings';

function getShell() {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  return "bash"; // fallback safe
}

export function generateCompletion(program: Command): string {
  const cli = program.name();

  return `
_${cli}_completions() {
  local cur line
  cur="\${COMP_WORDS[COMP_CWORD]}"
  line="\${COMP_LINE}"

  COMPREPLY=( $(compgen -W "$(${cli} __complete --line \"$line\")" -- "$cur") )
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
  console.log(shell === "zsh"
    ? `  source ${file}`
    : `  source ${file}`
  );
}
