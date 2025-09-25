
export function wrapAsyncAction(actionFn: (...args: any[]) => Promise<void>) {
  return async (...args: any[]) => {
    try {
      await actionFn(...args);
    } catch (error) {
      logger.error(error);
    } finally {
      await logger.printJson();
    }
  };
}

type LogData = Record<string, any>;

interface LoggerConfig {
  silent: boolean;
  jsonMode: boolean;
}

class Logger {
  private static instance: Logger;
  private config: LoggerConfig = { silent: false, jsonMode: false };
  private data: LogData = {};

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

  public setJsonMode(jsonMode?: boolean) {
    this.config.jsonMode = Boolean(jsonMode);
    this.config.silent = Boolean(jsonMode); // Auto-set silent when in JSON mode
  }

  // Console methods
  public log(...args: any[]) {
    if (!this.config.silent) {
      console.log(...args);
    };
  }

  public warn(...args: any[]) {
    if (!this.config.silent) {
      console.warn(...args);
    }
  }

  public error(...args: any[]) {
    if (!this.config.silent) {
      console.error(...args);
    }
    // Side effect: add error to data structure
    const errorMessage = args.map(arg => {
      if (arg instanceof Error) return String(arg)
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    }
    ).join(' ');

    if (this.data['error'] !== errorMessage) this.addData('error', errorMessage);
  }

  public table(data: any) {
    if (!this.config.silent) {
      console.table(data);
    }
  }

  // Data management methods
  public addData<K extends string>(key: K, value: any) {
    if (this.config.jsonMode) {
      this.data[key] = this.data[key] !== undefined ? this.data[key] + "\n" + value : value
    };
  }

  public getData(): LogData {
    return { ...this.data };
  }

  public clearData() {
    this.data = {};
  }

  // JSON output method
  public printJson(): void {
    if (this.config.jsonMode) console.log(JSON.stringify(this.data, null, 2));
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
