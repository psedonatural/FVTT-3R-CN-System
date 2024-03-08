export class LogLevel {
  static DEBUG = 0;
  static INFO = 1;
  static WARN = 2;
  static ERROR = 3;
  static FATAL = 4;
}

export class LogHelper {
  static logLevel = LogLevel.DEBUG;

  static setLogLevel(level) {
    LogHelper.logLevel = level;
  }
  static log(...data) {
    if (LogHelper.logLevel > LogLevel.DEBUG) return;
    console.log(...data);
  }

  static info(data) {
    if (LogHelper.logLevel > LogLevel.INFO) return;
    console.log(...data);
  }

  static warn(data) {
    if (LogHelper.logLevel > LogLevel.WARN) return;
    console.warn(...data);
  }

  static error(data) {
    if (LogHelper.logLevel > LogLevel.ERROR) return;
    console.error(...data);
  }

  static startTimer(name) {
    if (LogHelper.logLevel !== LogLevel.DEBUG) return;
    console.time(name);
  }

  static getTime(name) {
    if (LogHelper.logLevel !== LogLevel.DEBUG) return;
    console.timeEnd(name);
  }

  static debug(data) {
    if (LogHelper.logLevel > LogLevel.DEBUG) return;
    console.log(...data);
  }
}
