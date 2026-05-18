import { nodeLogger, NodeUserInteraction, NodeProgress } from '@suzaku-network/suzaku-sdk/node';
import type { LogLevel, NodeLoggerInstance } from '@suzaku-network/suzaku-sdk/node';
import dotenv from 'dotenv';

dotenv.config();

nodeLogger.setUserInteraction(new NodeUserInteraction());
nodeLogger.setProgressHandler(new NodeProgress());

if (process.env.LogLevel) {
    nodeLogger.setLogLevel(process.env.LogLevel as LogLevel);
}

const _error = nodeLogger.error.bind(nodeLogger);
nodeLogger.error = (...args: any[]) => {
    _error(...args);
    process.exitCode = 1;
};

export const logger = nodeLogger;
export type { LogLevel };
export type LoggerInstance = NodeLoggerInstance;
