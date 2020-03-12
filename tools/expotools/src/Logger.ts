import chalk from 'chalk';
import readline from 'readline';

export class Logger {
  verbose(...args: any[]): void {
    console.debug(...args.map(arg => chalk.dim(arg)));
  }

  debug(...args: any[]): void {
    console.debug(...args.map(arg => chalk.gray(arg)));
  }

  log(...args: any[]): void {
    console.log(...args);
  }

  success(...args: any[]): void {
    console.log(...args.map(arg => chalk.green(arg)));
  }

  info(...args: any[]): void {
    console.info(...args.map(arg => chalk.cyan(arg)));
  }

  warn(...args: any[]): void {
    console.warn(...args.map(arg => chalk.yellow.bold(arg)));
  }

  error(...args: any[]): void {
    console.error(...args.map(arg => chalk.red.bold(arg)));
  }

  clearLine() {
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
  }
}

export default new Logger();
