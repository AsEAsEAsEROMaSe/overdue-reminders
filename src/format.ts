/**
 * @file Текст повідомлення зі списком прострочених задач.
 * @module format
 *
 * Головний (хто використовує):
 * @see {@link ./run.ts}
 * @see {@link ../test/format.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./time.ts}
 * @see {@link ./types.ts}
 */

import { formatKyivDate } from './time.ts';
import type { Task } from './types.ts';

// Порівняння для сортування: раніший дедлайн іде першим
function compareByDeadline(a: Task, b: Task): number {
  return a.deadline.getTime() - b.deadline.getTime();
}

// Будує текст: задачі від найстарішого дедлайну, дата за Києвом
export function buildReminderText(tasks: Task[]): string {
  const sorted = tasks.slice();
  sorted.sort(compareByDeadline);

  const lines: string[] = [];
  lines.push('Прострочені задачі: ' + sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    const task = sorted[i];
    if (task === undefined) {
      continue;
    }
    const number = i + 1;
    lines.push(number + '. ' + task.title + ' (дедлайн ' + formatKyivDate(task.deadline) + ')');
  }
  return lines.join('\n');
}
