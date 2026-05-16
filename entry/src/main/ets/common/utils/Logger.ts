/**
 * 集中式日志工具
 *
 * 提供带标签的结构化日志记录，支持:
 * - 日志级别过滤 (DEBUG / INFO / WARN / ERROR)
 * - Release 构建自动关闭 DEBUG/INFO
 * - 本地日志缓冲 (最近 100 条，用于问题诊断)
 *
 * 使用方式:
 *   Logger.info('SyncManager', 'Session created', { sessionId: 'A1B2' });
 *   Logger.error('RhythmEngine', 'Judge failed', err);
 *   const recent = Logger.getRecentLogs();
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export class Logger {
  private static level: LogLevel = LogLevel.DEBUG;
  private static buffer: string[] = [];
  private static readonly MAX_BUFFER_SIZE = 100;
  private static isRelease: boolean = false;

  /** 设置发布模式 (关闭 DEBUG/INFO) */
  static setReleaseMode(release: boolean): void {
    Logger.isRelease = release;
    if (release) {
      Logger.level = LogLevel.WARN;
    }
  }

  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }

  static debug(tag: string, message: string, data?: Object): void {
    if (Logger.level > LogLevel.DEBUG) return;
    const entry = `[DEBUG][${tag}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    Logger.write(entry);
    if (!Logger.isRelease) console.debug(entry);
  }

  static info(tag: string, message: string, data?: Object): void {
    if (Logger.level > LogLevel.INFO) return;
    const entry = `[INFO][${tag}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    Logger.write(entry);
    if (!Logger.isRelease) console.info(entry);
  }

  static warn(tag: string, message: string, data?: Object): void {
    if (Logger.level > LogLevel.WARN) return;
    const entry = `[WARN][${tag}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    Logger.write(entry);
    console.warn(entry);
  }

  static error(tag: string, message: string, error?: Error | Object): void {
    if (Logger.level > LogLevel.ERROR) return;
    const entry = `[ERROR][${tag}] ${message}${error ? ' ' + JSON.stringify(error) : ''}`;
    Logger.write(entry);
    console.error(entry);
  }

  /** 获取最近 N 条日志 (用于错误报告) */
  static getRecentLogs(count: number = 50): string[] {
    return Logger.buffer.slice(-count);
  }

  /** 获取最近一次 ERROR 日志 */
  static getLastError(): string | null {
    for (let i = Logger.buffer.length - 1; i >= 0; i--) {
      if (Logger.buffer[i].startsWith('[ERROR]')) {
        return Logger.buffer[i];
      }
    }
    return null;
  }

  /** 清空日志缓冲 */
  static clearBuffer(): void {
    Logger.buffer = [];
  }

  private static write(entry: string): void {
    const timestamp = new Date().toISOString();
    Logger.buffer.push(`[${timestamp}] ${entry}`);
    if (Logger.buffer.length > Logger.MAX_BUFFER_SIZE) {
      Logger.buffer.shift();
    }
  }
}
