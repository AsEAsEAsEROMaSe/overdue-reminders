/**
 * @file Тести вибору прострочених задач і групування за виконавцем.
 * @module overdue.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/overdue.ts}
 * @see {@link ../src/types.ts}
 */

import { describe, it, expect } from 'vitest';
import { groupOverdueByUser } from '../src/overdue.ts';
import type { Task } from '../src/types.ts';

// 10:00 10 березня 2026 за Києвом (зимовий час, UTC+2)
const NOW = new Date('2026-03-10T08:00:00Z');

function makeTask(id: string, assigneeId: string, deadlineIso: string, status: Task['status']): Task {
  const task: Task = {
    id: id,
    assigneeId: assigneeId,
    title: 'Задача ' + id,
    deadline: new Date(deadlineIso),
    status: status,
  };
  return task;
}

describe('groupOverdueByUser', () => {
  it('тест брифу 1: дедлайн 01:30 10 березня за Києвом о 10:00 того ж дня ще не прострочений', () => {
    const task = makeTask('t1', 'u1', '2026-03-09T23:30:00Z', 'open');
    const result = groupOverdueByUser([task], NOW);
    expect(result.groups).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('дедлайн 23:59 9 березня за Києвом вже прострочений', () => {
    const task = makeTask('t1', 'u1', '2026-03-09T21:59:00Z', 'open');
    const result = groupOverdueByUser([task], NOW);
    expect(result.groups).toEqual([{ userId: 'u1', tasks: [task] }]);
  });

  it('літній час: дедлайн 00:30 15 липня за Києвом о 10:00 того ж дня ще не прострочений', () => {
    // 21:30 UTC 14 липня = 00:30 15 липня за Києвом (UTC+3); зараз 10:00 15 липня
    const task = makeTask('t1', 'u1', '2026-07-14T21:30:00Z', 'open');
    const result = groupOverdueByUser([task], new Date('2026-07-15T07:00:00Z'));
    expect(result.groups).toEqual([]);
  });

  it('тест брифу 3: задача done з простроченим дедлайном не потрапляє в список', () => {
    const doneTask = makeTask('t1', 'u1', '2026-03-01T10:00:00Z', 'done');
    const openTask = makeTask('t2', 'u2', '2026-03-01T10:00:00Z', 'in_progress');
    const result = groupOverdueByUser([doneTask, openTask], NOW);
    expect(result.groups).toEqual([{ userId: 'u2', tasks: [openTask] }]);
  });

  it('групує задачі за виконавцем у порядку появи', () => {
    const a1 = makeTask('a1', 'u1', '2026-03-01T10:00:00Z', 'open');
    const b1 = makeTask('b1', 'u2', '2026-03-02T10:00:00Z', 'open');
    const a2 = makeTask('a2', 'u1', '2026-03-03T10:00:00Z', 'in_progress');
    const result = groupOverdueByUser([a1, b1, a2], NOW);
    expect(result.groups).toEqual([
      { userId: 'u1', tasks: [a1, a2] },
      { userId: 'u2', tasks: [b1] },
    ]);
  });

  it('тест брифу 8 (частина): задача без дедлайну чи виконавця йде у skipped', () => {
    const good = makeTask('ok', 'u1', '2026-03-01T10:00:00Z', 'open');
    // Старі записи без полів: обходимо типи навмисно
    const noDeadline = { id: 'nd', assigneeId: 'u1', title: 'Без дедлайну', status: 'open' } as unknown as Task;
    const noAssignee = { id: 'na', title: 'Без виконавця', deadline: new Date('2026-03-01T10:00:00Z'), status: 'open' } as unknown as Task;
    const badDate = makeTask('bd', 'u1', 'не дата', 'open');
    const result = groupOverdueByUser([noDeadline, good, noAssignee, badDate], NOW);
    expect(result.groups).toEqual([{ userId: 'u1', tasks: [good] }]);
    expect(result.skipped).toEqual([
      { kind: 'task', id: 'nd', reason: 'no_deadline' },
      { kind: 'task', id: 'na', reason: 'no_assignee' },
      { kind: 'task', id: 'bd', reason: 'no_deadline' },
    ]);
  });
});
