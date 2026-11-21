/**
 * @file Тести вибору прострочених задач і групування за виконавцем.
 * @module overdue.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/overdue.ts}
 * @see {@link ./builders.ts}
 */

import { describe, it, expect } from 'vitest';
import { groupOverdueByUser } from '../src/overdue.ts';
import {
  makeTask,
  makeTaskInProgress,
  makeDoneTask,
  makeTaskWithoutDeadline,
  makeDoneTaskWithoutDeadline,
  makeTaskWithoutAssignee,
  freezeTasks,
} from './builders.ts';

// 10:00 10 березня 2026 за Києвом (зимовий час, UTC+2); доба почалась о 22:00 UTC 9 березня
const NOW = new Date('2026-03-10T08:00:00Z');

describe('groupOverdueByUser: що вважається простроченим', () => {
  it('тест брифу 1: дедлайн 01:30 10 березня за Києвом о 10:00 того ж дня ще не прострочений', () => {
    const task = makeTask('t1', 'u1', 'Задача', '2026-03-09T23:30:00Z');

    const result = groupOverdueByUser([task], NOW);

    expect(result.groups).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('дедлайн рівно о 00:00 поточної доби за Києвом ще не прострочений', () => {
    const task = makeTask('t1', 'u1', 'Задача', '2026-03-09T22:00:00.000Z');

    const result = groupOverdueByUser([task], NOW);

    expect(result.groups).toEqual([]);
  });

  it('дедлайн за мілісекунду до початку доби вже прострочений', () => {
    const task = makeTask('t1', 'u1', 'Задача', '2026-03-09T21:59:59.999Z');

    const result = groupOverdueByUser([task], NOW);

    expect(result.groups).toEqual([{ userId: 'u1', tasks: [task] }]);
  });

  it('дедлайн сьогодні раніше за «зараз» ще не прострочений', () => {
    // 07:00 10 березня за Києвом, а зараз 10:00
    const task = makeTask('t1', 'u1', 'Задача', '2026-03-10T05:00:00Z');

    const result = groupOverdueByUser([task], NOW);

    expect(result.groups).toEqual([]);
  });

  it('літній час: дедлайн 00:30 15 липня за Києвом о 10:00 того ж дня ще не прострочений', () => {
    // 21:30 UTC 14 липня = 00:30 15 липня за Києвом (UTC+3)
    const task = makeTask('t1', 'u1', 'Задача', '2026-07-14T21:30:00Z');

    const result = groupOverdueByUser([task], new Date('2026-07-15T07:00:00Z'));

    expect(result.groups).toEqual([]);
  });

  it('літній час: дедлайн 23:59 14 липня за Києвом уже прострочений', () => {
    const task = makeTask('t1', 'u1', 'Задача', '2026-07-14T20:59:00Z');

    const result = groupOverdueByUser([task], new Date('2026-07-15T07:00:00Z'));

    expect(result.groups).toEqual([{ userId: 'u1', tasks: [task] }]);
  });

  it('тест брифу 3: задача done з простроченим дедлайном не потрапляє в список', () => {
    const doneTask = makeDoneTask('t1', 'u1', 'Зроблено', '2026-03-01T10:00:00Z');
    const openTask = makeTaskInProgress('t2', 'u2', 'В роботі', '2026-03-01T10:00:00Z');

    const result = groupOverdueByUser([doneTask, openTask], NOW);

    expect(result.groups).toEqual([{ userId: 'u2', tasks: [openTask] }]);
  });

  it('статуси open і in_progress обидва потрапляють у список', () => {
    const open = makeTask('t1', 'u1', 'Відкрита', '2026-03-01T10:00:00Z');
    const inProgress = makeTaskInProgress('t2', 'u1', 'В роботі', '2026-03-02T10:00:00Z');

    const result = groupOverdueByUser([open, inProgress], NOW);

    expect(result.groups).toEqual([{ userId: 'u1', tasks: [open, inProgress] }]);
  });

  it('задача done без дедлайну просто ігнорується, у skipped не йде', () => {
    const doneOld = makeDoneTaskWithoutDeadline('old', 'u1');

    const result = groupOverdueByUser([doneOld], NOW);

    expect(result.groups).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe('groupOverdueByUser: групування', () => {
  it('порожній список задач дає порожній результат', () => {
    const result = groupOverdueByUser([], NOW);

    expect(result).toEqual({ groups: [], skipped: [] });
  });

  it('групує задачі за виконавцем у порядку появи', () => {
    const a1 = makeTask('a1', 'u1', 'А1', '2026-03-01T10:00:00Z');
    const b1 = makeTask('b1', 'u2', 'Б1', '2026-03-02T10:00:00Z');
    const a2 = makeTaskInProgress('a2', 'u1', 'А2', '2026-03-03T10:00:00Z');

    const result = groupOverdueByUser([a1, b1, a2], NOW);

    expect(result.groups).toEqual([
      { userId: 'u1', tasks: [a1, a2] },
      { userId: 'u2', tasks: [b1] },
    ]);
  });

  it('виконавець, у якого всі задачі не прострочені, у групи не потрапляє', () => {
    const overdue = makeTask('t1', 'u1', 'Прострочена', '2026-03-01T10:00:00Z');
    const future = makeTask('t2', 'u2', 'На завтра', '2026-03-11T10:00:00Z');

    const result = groupOverdueByUser([overdue, future], NOW);

    expect(result.groups).toEqual([{ userId: 'u1', tasks: [overdue] }]);
  });
});

describe('groupOverdueByUser: погані дані (тест брифу 8, частина)', () => {
  it('задача без дедлайну, з невалідною датою чи без виконавця йде у skipped', () => {
    const good = makeTask('ok', 'u1', 'Нормальна', '2026-03-01T10:00:00Z');
    const noDeadline = makeTaskWithoutDeadline('nd', 'u1');
    const noAssignee = makeTaskWithoutAssignee('na', '2026-03-01T10:00:00Z');
    const badDate = makeTask('bd', 'u1', 'Погана дата', 'не дата');

    const result = groupOverdueByUser([noDeadline, good, noAssignee, badDate], NOW);

    expect(result.groups).toEqual([{ userId: 'u1', tasks: [good] }]);
    expect(result.skipped).toEqual([
      { kind: 'task', id: 'nd', reason: 'no_deadline' },
      { kind: 'task', id: 'na', reason: 'no_assignee' },
      { kind: 'task', id: 'bd', reason: 'no_deadline' },
    ]);
  });

  it('порожній рядок замість виконавця теж no_assignee', () => {
    const task = makeTask('t1', '', 'Без виконавця', '2026-03-01T10:00:00Z');

    const result = groupOverdueByUser([task], NOW);

    expect(result.groups).toEqual([]);
    expect(result.skipped).toEqual([{ kind: 'task', id: 't1', reason: 'no_assignee' }]);
  });
});

describe('groupOverdueByUser: вхідні дані не змінюються', () => {
  it('вхідний масив і задачі лишаються як були', () => {
    const tasks = freezeTasks([
      makeTask('t1', 'u1', 'Стара', '2026-03-01T10:00:00Z'),
      makeTask('t2', 'u2', 'Сьогоднішня', '2026-03-10T05:00:00Z'),
      makeDoneTask('t3', 'u1', 'Зроблена', '2026-03-01T10:00:00Z'),
      makeTaskWithoutDeadline('t4', 'u1'),
      makeTaskWithoutAssignee('t5', '2026-03-01T10:00:00Z'),
    ]);

    groupOverdueByUser(tasks, NOW);

    expect(tasks).toEqual([
      makeTask('t1', 'u1', 'Стара', '2026-03-01T10:00:00Z'),
      makeTask('t2', 'u2', 'Сьогоднішня', '2026-03-10T05:00:00Z'),
      makeDoneTask('t3', 'u1', 'Зроблена', '2026-03-01T10:00:00Z'),
      makeTaskWithoutDeadline('t4', 'u1'),
      makeTaskWithoutAssignee('t5', '2026-03-01T10:00:00Z'),
    ]);
  });

  it('групи містять ті самі задачі, а не змінені копії', () => {
    const task = makeTask('t1', 'u1', 'Стара', '2026-03-01T10:00:00Z');

    const result = groupOverdueByUser(freezeTasks([task]), NOW);

    expect(result.groups[0].tasks[0]).toBe(task);
  });
});
