export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject { [key: string]: JsonValue }
export interface JsonArray extends Array<JsonValue> { }

export type LogData = Record<string, any>;

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export enum LogLevelEnum {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface UserInteractionInterface {
  askQuestion(question: string): Promise<string>;
}

export interface ProgressInterface {
  start(total: number, label?: string): void;
  update(value: number): void;
  increment(): void;
  stop(): void;
}

const defaultUserInteraction: UserInteractionInterface = {
  askQuestion: (_question: string) => Promise.resolve('y'),
};

const defaultProgress: ProgressInterface = {
  start: () => {},
  update: () => {},
  increment: () => {},
  stop: () => {},
};

export interface LoggerConfig {
  silent: boolean;
  jsonMode: boolean;
  logLevel: LogLevelEnum;
  userInteraction: UserInteractionInterface;
  progress: ProgressInterface;
}

function bigintReplacer(_key: string, value: any) {
  if (typeof value === 'bigint') return Number(value);
  return value;
}

class Logger {
  private static instance: Logger;
  public config: LoggerConfig = {
    silent: false,
    jsonMode: false,
    logLevel: LogLevelEnum.INFO,
    userInteraction: defaultUserInteraction,
    progress: defaultProgress,
  };
  public data: LogData = {};

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setSilent(silent: boolean) {
    this.config.silent = silent;
  }

  public setLogLevel(level: LogLevel) {
    this.config.logLevel = LogLevelEnum[level];
  }

  public setJsonMode(jsonMode?: boolean) {
    this.config.jsonMode = Boolean(jsonMode);
    this.config.silent = Boolean(jsonMode);
  }

  public setUserInteraction(interaction: UserInteractionInterface) {
    this.config.userInteraction = interaction;
  }

  public setProgressHandler(handler: ProgressInterface) {
    this.config.progress = handler;
  }

  public startProgress(total: number, label?: string) {
    if (!this.config.silent) this.config.progress.start(total, label);
  }

  public updateProgress(value: number) {
    this.config.progress.update(value);
  }

  public incrementProgress() {
    this.config.progress.increment();
  }

  public stopProgress() {
    this.config.progress.stop();
  }

  private shouldLog(level: LogLevel): boolean {
    return !this.config.silent && LogLevelEnum[level] >= this.config.logLevel;
  }

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
    const errorMessage = args.map(arg => {
      if (arg instanceof Error) return String(arg);
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ');

    if (this.data['error'] !== errorMessage) this.addData('error', errorMessage);
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

        const connector = isLast ? '└── ' : '├── ';

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
    }
  }

  public prompt(question: string): Promise<string> {
    if (this.config.jsonMode) {
      return Promise.resolve('y');
    }
    return this.config.userInteraction.askQuestion(question);
  }

  public getData(): LogData {
    return { ...this.data };
  }

  public clearData() {
    this.data = {};
  }

  public printJson(): void {
    if (this.config.jsonMode) {
      if (this.data.error) {
        console.error(JSON.stringify(this.data, bigintReplacer, 2));
      } else {
        console.log(JSON.stringify(this.data, bigintReplacer, 2));
      }
    }
  }

  public getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }
}

export const logger = Logger.getInstance();
export type LoggerInstance = typeof logger;
