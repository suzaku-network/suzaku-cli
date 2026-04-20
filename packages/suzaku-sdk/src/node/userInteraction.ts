import * as readline from 'readline';
import type { UserInteractionInterface } from '../core/logger/index';

export class NodeUserInteraction implements UserInteractionInterface {
  askQuestion(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise(resolve => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}
