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
export function buildReminderText(tasks: readonly Task[]): string {
  const sorted = tasks.slice();
  sorted.sort(compareByDeadline);

  let text = 'Прострочені задачі: ' + sorted.length;
  let number = 1;
  for (const task of sorted) {
    const deadline = formatKyivDate(task.deadline);
    text = text + '\n' + number + '. ' + task.title + ' (дедлайн ' + deadline + ')';
    number = number + 1;
  }
  return text;
}
