/**
 * @file Тести одного запуску нагадувань: доставка, дублі, блокування, збої, погані дані.
 * @module run.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/run.ts}
 * @see {@link ../src/mocks.ts}
 * @see {@link ../src/types.ts}
 */

import { describe, it, expect } from 'vitest';
import { runDailyReminders } from '../src/run.ts';
import type { RunDeps } from '../src/run.ts';
import {
  createTaskRepo,
  createUserRepo,
  createMessenger,
  createSentLog,
  createAttemptLog,
  createLock,
} from '../src/mocks.ts';
import type { MessengerMock } from '../src/mocks.ts';
import type { Task, User } from '../src/types.ts';

// 10:00 10 березня 2026 за Києвом
const NOW = new Date('2026-03-10T08:00:00Z');
// Наступний запуск того ж дня, 10:30 за Києвом
const LATER_SAME_DAY = new Date('2026-03-10T08:30:00Z');

// Вигадані chat_id для тестів, не справжні
const USERS: User[] = [
  { id: 'anna', telegramChatId: 'chat-anna' },
  { id: 'bohdan', telegramChatId: 'chat-bohdan' },
  { id: 'vira', telegramChatId: 'chat-vira' },
];

function makeTask(id: string, assigneeId: string, title: string, deadlineIso: string): Task {
  const task: Task = {
    id: id,
    assigneeId: assigneeId,
    title: title,
    deadline: new Date(deadlineIso),
    status: 'open',
  };
  return task;
}

// По одній простроченій задачі на кожного з трьох користувачів
function threeOverdueTasks(): Task[] {
  return [
    makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
    makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
    makeTask('t3', 'vira', 'Договір', '2026-03-07T10:00:00Z'),
  ];
}

interface TestSetup {
  deps: RunDeps;
  messenger: MessengerMock;
}

function setup(tasks: Task[], users: User[]): TestSetup {
  const messenger = createMessenger();
  const deps: RunDeps = {
    taskRepo: createTaskRepo(tasks),
    userRepo: createUserRepo(users),
    messenger: messenger,
    sentLog: createSentLog(),
    attemptLog: createAttemptLog(),
    lock: createLock(),
    sendTimeoutMs: 50,
  };
  return { deps: deps, messenger: messenger };
}

describe('runDailyReminders: доставка', () => {
  it('кожен отримує одне повідомлення зі своїми задачами від найстарішої', async () => {
    const tasks = [
      makeTask('t1', 'anna', 'Пізніша', '2026-03-08T10:00:00Z'),
      makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
      makeTask('t3', 'anna', 'Раніша', '2026-03-02T10:00:00Z'),
    ];
    const { deps, messenger } = setup(tasks, USERS);

    const report = await runDailyReminders(NOW, deps);

    expect(messenger.sent).toEqual([
      {
        chatId: 'chat-anna',
        text: 'Прострочені задачі: 2\n1. Раніша (дедлайн 02.03.2026 12:00)\n2. Пізніша (дедлайн 08.03.2026 12:00)',
      },
      {
        chatId: 'chat-bohdan',
        text: 'Прострочені задачі: 1\n1. Звіт (дедлайн 06.03.2026 12:00)',
      },
    ]);
    expect(report).toEqual({ sent: ['anna', 'bohdan'], skipped: [], failed: [] });
  });

  it('тест брифу 9: користувач без прострочених задач нічого не отримує', async () => {
    const tasks = [
      makeTask('t1', 'anna', 'Прострочена', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'bohdan', 'На завтра', '2026-03-11T10:00:00Z'),
    ];
    const { deps, messenger } = setup(tasks, USERS);

    const report = await runDailyReminders(NOW, deps);

    expect(messenger.attempts).toEqual(['chat-anna']);
    expect(report).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });
});

describe('runDailyReminders: дублі і паралельний запуск', () => {
  it('тест брифу 4: повторний запуск того ж дня не шле нічого', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);

    await runDailyReminders(NOW, deps);
    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(messenger.attempts).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
    expect(secondReport).toEqual({ sent: [], skipped: [], failed: [] });
  });

  it('наступного дня нагадування знову йдуть', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);
    const nextDay = new Date('2026-03-11T08:00:00Z');

    await runDailyReminders(NOW, deps);
    const nextReport = await runDailyReminders(nextDay, deps);

    expect(messenger.sent.length).toBe(6);
    expect(nextReport.sent).toEqual(['anna', 'bohdan', 'vira']);
  });
});
