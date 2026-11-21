/**
 * @file Тести тексту повідомлення про прострочені задачі.
 * @module format.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/format.ts}
 * @see {@link ./builders.ts}
 */

import { describe, it, expect } from 'vitest';
import { buildReminderText } from '../src/format.ts';
import { makeTask } from './builders.ts';

describe('buildReminderText', () => {
  it('одна задача: заголовок і один пункт', () => {
    const task = makeTask('t1', 'u1', 'Рахунок', '2026-03-05T10:00:00Z');

    const text = buildReminderText([task]);

    expect(text).toBe('Прострочені задачі: 1\n1. Рахунок (дедлайн 05.03.2026 12:00)');
  });

  it('задачі від найстарішої, дата і час за Києвом', () => {
    const newer = makeTask('t1', 'u1', 'Звіт за лютий', '2026-03-05T09:15:00Z');
    const older = makeTask('t2', 'u1', 'Договір з постачальником', '2026-02-27T22:00:00Z');

    const text = buildReminderText([newer, older]);

    expect(text).toBe(
      'Прострочені задачі: 2\n' +
        '1. Договір з постачальником (дедлайн 28.02.2026 00:00)\n' +
        '2. Звіт за лютий (дедлайн 05.03.2026 11:15)',
    );
  });

  it('три задачі в перемішаному порядку сортуються за дедлайном', () => {
    const middle = makeTask('t1', 'u1', 'Друга', '2026-03-02T10:00:00Z');
    const last = makeTask('t2', 'u1', 'Третя', '2026-03-03T10:00:00Z');
    const first = makeTask('t3', 'u1', 'Перша', '2026-03-01T10:00:00Z');

    const text = buildReminderText([middle, last, first]);

    expect(text).toBe(
      'Прострочені задачі: 3\n' +
        '1. Перша (дедлайн 01.03.2026 12:00)\n' +
        '2. Друга (дедлайн 02.03.2026 12:00)\n' +
        '3. Третя (дедлайн 03.03.2026 12:00)',
    );
  });

  it('задачі з однаковим дедлайном лишаються в початковому порядку', () => {
    const a = makeTask('t1', 'u1', 'А', '2026-03-01T10:00:00Z');
    const b = makeTask('t2', 'u1', 'Б', '2026-03-01T10:00:00Z');

    const text = buildReminderText([a, b]);

    expect(text).toBe('Прострочені задачі: 2\n1. А (дедлайн 01.03.2026 12:00)\n2. Б (дедлайн 01.03.2026 12:00)');
  });

  it('не змінює порядок у переданому масиві', () => {
    const newer = makeTask('t1', 'u1', 'Б', '2026-03-05T09:15:00Z');
    const older = makeTask('t2', 'u1', 'А', '2026-02-27T22:00:00Z');
    const tasks = [newer, older];

    buildReminderText(tasks);

    expect(tasks).toEqual([newer, older]);
  });
});
