import { color } from 'console-log-colors';
import { logger } from '../core/logger/index';
import type { LoggerInstance } from '../core/logger/index';
import { NodeUserInteraction } from './userInteraction';
import { NodeProgress } from './progress';

logger.setUserInteraction(new NodeUserInteraction());
logger.setProgressHandler(new NodeProgress());

export function formatError(args: any[], stackPop: number = 0): Error {
  const err = new Error();
  err.stack = color.red(args.join(' ')) + '\n' + err.stack?.split('\n').slice(2 + stackPop, -1).join('\n');
  return err;
}

export type NodeLoggerInstance = LoggerInstance & { formatError: typeof formatError };

export const nodeLogger: NodeLoggerInstance = Object.assign(logger, { formatError });
