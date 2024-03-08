import {LogHelper} from '../helpers/LogHelper.js';

export class Logger {
  log(...data) {
    LogHelper.log('D35E | ', ...data);
  }

  error(...data) {
    LogHelper.error('D35E | ', ...data);
  }

  warn(...data) {
    LogHelper.warn('D35E | ', ...data);
  }
}
