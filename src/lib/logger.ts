import { color } from "console-log-colors";
import { bigintReplacer } from "./utils";
import * as readline from 'readline';
import dotenv from 'dotenv';
dotenv.config();

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject { [key: string]: JsonValue }
interface JsonArray extends Array<JsonValue> { }

type LogData = Record<string, any>;

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

enum LogLevelEnum {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LoggerConfig {
  silent: boolean;
  jsonMode: boolean;
  logLevel: LogLevelEnum;
}

class Logger {
  private static instance: Logger;
  private config: LoggerConfig = { silent: false, jsonMode: false, logLevel: process.env.LogLevel ? LogLevelEnum[process.env.LogLevel as LogLevel] : LogLevelEnum.INFO };
  public data: LogData = {};

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Configuration methods
  public setSilent(silent: boolean) {
    this.config.silent = silent;
  }

  public setLogLevel(level: LogLevel) {
    this.config.logLevel = LogLevelEnum[level];
  }

  public setJsonMode(jsonMode?: boolean) {
    this.config.jsonMode = Boolean(jsonMode);
    this.config.silent = Boolean(jsonMode); // Auto-set silent when in JSON mode
  }

  private shouldLog(level: LogLevel): boolean {
    return !this.config.silent && LogLevelEnum[level] >= this.config.logLevel;
  }

  // Console methods
  public debug(...args: any[]) {
    if (this.shouldLog('DEBUG')) {
      console.debug('[DEBUG]', ...args);
    }
  }

  public log(...args: any[]) {
    if (this.shouldLog('INFO')) {
      console.log(...args);
    }
  }

  public info(...args: any[]) {
    if (this.shouldLog('INFO')) {
      console.info(...args);
    }
  }

  public warn(...args: any[]) {
    if (this.shouldLog('WARN')) {
      console.warn(...args);
    }
  }

  public error(...args: any[]) {
    if (this.shouldLog('ERROR')) {
      console.error(...args);
    }
    // Side effect: add error to data structure
    const errorMessage = args.map(arg => {
      if (arg instanceof Error) return String(arg)
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    }
    ).join(' ');

    if (this.data['error'] !== errorMessage) this.addData('error', errorMessage);

    process.exitCode = 1;
  }

  public exitError(args: any[], stackPop: number = 0) {
    const err = new Error();
    this.error(...args, color.red("\nCLI Stack trace:\n" + err.stack?.split("\n").slice( 2 + stackPop, -1).join("\n")));
    process.exit(1);
  }

  public table(data: any) {
    if (!this.config.silent) {
      console.table(data);
    }
  }

  public logJsonTree(data: JsonObject | JsonArray): void {
    if (this.config.silent) return;

    const lines: string[] = [];

    const buildLines = (node: any, prefix: string, skipFirstKey: boolean = false) => {
      let keys = Object.keys(node);

      if (skipFirstKey && !Array.isArray(node)) {
        keys = keys.slice(1);
      }

      const isParentArray = Array.isArray(node);
      let childPrefix: string;
      keys.forEach((key, i) => {
        const value = node[key];
        const isContainer = typeof value === 'object' && value !== null;
        const isLast = i === keys.length - 1;

        if (isParentArray && i > 0 && isContainer) {
          lines.push(childPrefix || '');
        }

        let connector = isLast ? '└── ' : '├── ';

        if (isParentArray && isContainer) {
          const childKeys = Object.keys(value);

          if (childKeys.length > 0) {
            const firstKey = childKeys[0];
            const firstVal = value[firstKey];
            const displayFirstVal = typeof firstVal === 'string' ? `"${firstVal}"` : firstVal;

            const headerLabel = `${firstKey}: ${displayFirstVal}`;

            const specialConnector = isLast ? '└───┬── ' : childPrefix ? '├───┬── ' : '┌───┬── ';

            lines.push(`${prefix}${specialConnector}${headerLabel}`);

            childPrefix = prefix + (isLast ? '    ' : '│   ');
            buildLines(value, childPrefix, true);
            return;
          }
        }

        let displayLabel = key;
        if (isParentArray) displayLabel = '';

        if (isContainer) {
          lines.push(`${prefix}${connector}${displayLabel}`);
          childPrefix = prefix + (isLast ? '    ' : '│   ');
          buildLines(value, childPrefix, false);
        } else {
          const displayValue = typeof value === 'string' ? `"${value}"` : value;

          if (isParentArray) {
            lines.push(`${prefix}${connector}${displayValue}`);
          } else {
            lines.push(`${prefix}${connector}${displayLabel}: ${displayValue}`);
          }
        }
      });
    };

    buildLines(data, '');
    console.log(lines.join('\n'));
  }

  // Data management methods
  public addData<K extends string>(key: K, value: any) {
    if (this.config.jsonMode) {
      if (this.data[key] === undefined) {
        this.data[key] = value;
      } else {
        if (Array.isArray(this.data[key])) {
          this.data[key].push(value);
        } else {
          this.data[key] = [this.data[key], value];
        }
      }
    };
  }

  public prompt(question: string): Promise<string> {
    if (this.config.jsonMode) {
      return Promise.resolve('y');
    }
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

  public getData(): LogData {
    return { ...this.data };
  }

  public clearData() {
    this.data = {};
  }

  // JSON output method
  public printJson(): void {
    if (this.config.jsonMode) console.log(JSON.stringify(this.data, bigintReplacer, 2));
  }

  // Utility method to get current config
  public getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export type for better TypeScript integration
export type LoggerInstance = typeof logger;
