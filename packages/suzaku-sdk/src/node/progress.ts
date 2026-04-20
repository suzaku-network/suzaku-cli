import cliProgress, { SingleBar } from 'cli-progress';
import type { ProgressInterface } from '../core/logger/index';

export class NodeProgress implements ProgressInterface {
  private bar: SingleBar | null = null;

  start(total: number, label?: string) {
    this.bar = new cliProgress.SingleBar({
      format: `${label ? label + ' ' : ''}[{bar}] {percentage}% | {value}/{total}`,
    }, cliProgress.Presets.shades_classic);
    this.bar.start(total, 0);
  }

  update(value: number) {
    this.bar?.update(value);
  }

  increment() {
    this.bar?.increment();
  }

  stop() {
    this.bar?.stop();
    this.bar = null;
  }
}
