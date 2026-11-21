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
import { makeTask, freezeTasks } from './builders.ts';

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

  it('працює із замороженим масивом: сортує копію, а не вхідний масив', () => {
    const tasks = freezeTasks([
      makeTask('t1', 'u1', 'Б', '2026-03-05T09:15:00Z'),
      makeTask('t2', 'u1', 'А', '2026-02-27T22:00:00Z'),
    ]);

    const text = buildReminderText(tasks);

    expect(text).toBe('Прострочені задачі: 2\n1. А (дедлайн 28.02.2026 00:00)\n2. Б (дедлайн 05.03.2026 11:15)');
  });

  it('порожній список: лише заголовок з нулем', () => {
    const text = buildReminderText([]);

    expect(text).toBe('Прострочені задачі: 0');
  });

  it('назва вставляється як є: лапки, апостроф, емодзі', () => {
    const task = makeTask('t1', 'u1', 'Договір «Ромашка» з ТОВ \'Сонце\' 📄', '2026-03-05T10:00:00Z');

    const text = buildReminderText([task]);

    expect(text).toBe('Прострочені задачі: 1\n1. Договір «Ромашка» з ТОВ \'Сонце\' 📄 (дедлайн 05.03.2026 12:00)');
  });

  it('порожня назва не ламає текст', () => {
    const task = makeTask('t1', 'u1', '', '2026-03-05T10:00:00Z');

    const text = buildReminderText([task]);

    expect(text).toBe('Прострочені задачі: 1\n1.  (дедлайн 05.03.2026 12:00)');
  });

  it('десять задач: нумерація від 1 до 10 без нулів попереду', () => {
    const tasks = [];
    for (let day = 1; day <= 10; day = day + 1) {
      let dayText = String(day);
      if (day < 10) {
        dayText = '0' + dayText;
      }
      tasks.push(makeTask('t' + day, 'u1', 'Задача ' + day, '2026-03-' + dayText + 'T10:00:00Z'));
    }

    const text = buildReminderText(tasks);

    const lines = text.split('\n');
    expect(lines.length).toBe(11);
    expect(lines[0]).toBe('Прострочені задачі: 10');
    expect(lines[1]).toBe('1. Задача 1 (дедлайн 01.03.2026 12:00)');
    expect(lines[9]).toBe('9. Задача 9 (дедлайн 09.03.2026 12:00)');
    expect(lines[10]).toBe('10. Задача 10 (дедлайн 10.03.2026 12:00)');
  });

  it('літній дедлайн показується за літнім часом', () => {
    const task = makeTask('t1', 'u1', 'Літня', '2026-07-01T09:00:00Z');

    const text = buildReminderText([task]);

    expect(text).toBe('Прострочені задачі: 1\n1. Літня (дедлайн 01.07.2026 12:00)');
  });
});
