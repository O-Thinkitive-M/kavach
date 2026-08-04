// `kavach log` — read the day-wise review log.

import { dayStamp, listLogDays, logsDir, readLog } from '../store/log.ts';
import { c } from '../brand.ts';

export interface LogOptions {
  root: string;
  day?: string;
  list: boolean;
}

export function logCommand(opts: LogOptions): void {
  if (opts.list) {
    const days = listLogDays(opts.root);
    if (days.length === 0) {
      process.stderr.write(c.grey(`  No reviews logged yet in ${logsDir(opts.root)}\n`));
      return;
    }
    process.stdout.write(days.join('\n') + '\n');
    return;
  }

  const day = opts.day ?? dayStamp();
  const content = readLog(opts.root, day);

  if (!content) {
    process.stderr.write(c.grey(`  No reviews logged on ${day}.\n`));
    const days = listLogDays(opts.root);
    if (days.length > 0) {
      process.stderr.write(c.grey(`  Available: ${days.slice(0, 7).join(', ')}\n`));
    }
    return;
  }

  process.stdout.write(content);
}
