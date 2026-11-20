/**
 * @file Тести тексту повідомлення про прострочені задачі.
 * @module format.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/format.ts}
 * @see {@link ../src/types.ts}
 */

import { describe, it, expect } from 'vitest';
import { buildReminderText } from '../src/format.ts';
import type { Task } from '../src/types.ts';

function makeTask(id: string, title: string, deadlineIso: string): Task {
  const task: Task = {
    id: id,
    assigneeId: 'u1',
    title: title,
    deadline: new Date(deadlineIso),
    status: 'open',
  };
  return task;
}

describe('buildReminderText', () => {
  it('задачі від найстарішої, дата і час за Києвом', () => {
    const newer = makeTask('t1', 'Звіт за лютий', '2026-03-05T09:15:00Z');
    const older = makeTask('t2', 'Договір з постачальником', '2026-02-27T22:00:00Z');
    const text = buildReminderText([newer, older]);
    expect(text).toBe(
      'Прострочені задачі: 2\n' +
        '1. Договір з постачальником (дедлайн 28.02.2026 00:00)\n' +
        '2. Звіт за лютий (дедлайн 05.03.2026 11:15)',
    );
  });

  it('не змінює порядок у переданому масиві', () => {
    const newer = makeTask('t1', 'Б', '2026-03-05T09:15:00Z');
    const older = makeTask('t2', 'А', '2026-02-27T22:00:00Z');
    const tasks = [newer, older];
    buildReminderText(tasks);
    expect(tasks).toEqual([newer, older]);
  });
});
