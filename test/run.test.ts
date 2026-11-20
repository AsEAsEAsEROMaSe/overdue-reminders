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

// chat_id усіх доставлених повідомлень по порядку
function sentChatIds(messenger: MessengerMock): string[] {
  const result: string[] = [];
  for (const message of messenger.sent) {
    result.push(message.chatId);
  }
  return result;
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

describe('runDailyReminders: блокування', () => {
  it('тест брифу 5: два запуски одночасно, кожен користувач отримує рівно одне повідомлення', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);

    const firstRun = runDailyReminders(NOW, deps);
    const secondRun = runDailyReminders(NOW, deps);
    const reports = await Promise.all([firstRun, secondRun]);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
    expect(reports[0]).toEqual({ sent: ['anna', 'bohdan', 'vira'], skipped: [], failed: [] });
    expect(reports[1]).toEqual({ sent: [], skipped: [], failed: [] });
  });

  it('якщо блокування цього дня вже тримає інший процес, запуск нічого не шле', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);
    await deps.lock.acquire('daily-reminders:2026-03-10');

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({ sent: [], skipped: [], failed: [] });
    expect(messenger.attempts).toEqual([]);
    expect(await deps.attemptLog.count('anna', '2026-03-10')).toBe(0);
  });

  it('блокування знімається навіть після помилки, наступний запуск працює', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);
    const realTaskRepo = deps.taskRepo;
    deps.taskRepo = {
      async listNotDone() {
        throw new Error('база недоступна');
      },
    };

    await expect(runDailyReminders(NOW, deps)).rejects.toThrow('база недоступна');

    deps.taskRepo = realTaskRepo;
    const report = await runDailyReminders(LATER_SAME_DAY, deps);
    expect(report.sent).toEqual(['anna', 'bohdan', 'vira']);
    expect(messenger.sent.length).toBe(3);
  });
});

describe('runDailyReminders: збої доставки', () => {
  it('тест брифу 6: збій одному з трьох не зупиняє решту, наступний запуск шле лише йому', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);
    messenger.failFor('chat-bohdan', 'rate_limited');

    const firstReport = await runDailyReminders(NOW, deps);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira']);
    expect(firstReport).toEqual({
      sent: ['anna', 'vira'],
      skipped: [],
      failed: [{ userId: 'bohdan', reason: 'rate_limited', final: false }],
    });
    expect(await deps.sentLog.has('bohdan', '2026-03-10')).toBe(false);
    expect(await deps.sentLog.has('anna', '2026-03-10')).toBe(true);

    messenger.clearFailure('chat-bohdan');
    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(secondReport).toEqual({ sent: ['bohdan'], skipped: [], failed: [] });
    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira', 'chat-bohdan']);
  });

  it('відповідь, що не прийшла вчасно, обривається таймаутом і не зупиняє решту', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);
    messenger.failFor('chat-anna', 'hang');

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({
      sent: ['bohdan', 'vira'],
      skipped: [],
      failed: [{ userId: 'anna', reason: 'timeout', final: false }],
    });
    expect(await deps.sentLog.has('anna', '2026-03-10')).toBe(false);
  });

  it('невідома помилка месенджера записується як error', async () => {
    const { deps } = setup(threeOverdueTasks(), USERS);
    deps.messenger = {
      async send() {
        throw new Error('мережа впала');
      },
    };

    const report = await runDailyReminders(NOW, deps);

    expect(report.sent).toEqual([]);
    expect(report.failed).toEqual([
      { userId: 'anna', reason: 'error', final: false },
      { userId: 'bohdan', reason: 'error', final: false },
      { userId: 'vira', reason: 'error', final: false },
    ]);
  });
});

describe('runDailyReminders: коди Telegram і ліміт спроб', () => {
  it('тест брифу 7: 403 не повторюється наступним запуском', async () => {
    const { deps, messenger } = setup(threeOverdueTasks(), USERS);
    messenger.failFor('chat-vira', 'blocked');

    const firstReport = await runDailyReminders(NOW, deps);
    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(firstReport).toEqual({
      sent: ['anna', 'bohdan'],
      skipped: [],
      failed: [{ userId: 'vira', reason: 'blocked', final: true }],
    });
    expect(secondReport).toEqual({
      sent: [],
      skipped: [],
      failed: [{ userId: 'vira', reason: 'attempts_exhausted', final: true }],
    });
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
  });

  it('після 403 того ж дня не пробуємо, навіть якщо бота вже розблокували', async () => {
    const tasks = [makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z')];
    const { deps, messenger } = setup(tasks, USERS);
    messenger.failFor('chat-anna', 'blocked');

    await runDailyReminders(NOW, deps);
    expect(await deps.attemptLog.count('anna', '2026-03-10')).toBe(3);

    messenger.clearFailure('chat-anna');
    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(secondReport.sent).toEqual([]);
    expect(messenger.sent).toEqual([]);
    expect(messenger.attempts).toEqual(['chat-anna']);
  });

  it('тест брифу 7: після трьох спроб з 429 користувач в остаточних failed', async () => {
    const tasks = [makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z')];
    const { deps, messenger } = setup(tasks, USERS);
    messenger.failFor('chat-anna', 'rate_limited');

    const report1 = await runDailyReminders(new Date('2026-03-10T08:00:00Z'), deps);
    const report2 = await runDailyReminders(new Date('2026-03-10T08:15:00Z'), deps);
    const report3 = await runDailyReminders(new Date('2026-03-10T08:30:00Z'), deps);
    const report4 = await runDailyReminders(new Date('2026-03-10T08:45:00Z'), deps);

    expect(report1.failed).toEqual([{ userId: 'anna', reason: 'rate_limited', final: false }]);
    expect(report2.failed).toEqual([{ userId: 'anna', reason: 'rate_limited', final: false }]);
    expect(report3.failed).toEqual([{ userId: 'anna', reason: 'rate_limited', final: true }]);
    expect(report4.failed).toEqual([{ userId: 'anna', reason: 'attempts_exhausted', final: true }]);
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-anna', 'chat-anna']);
    expect(messenger.sent).toEqual([]);
  });

  it('таймаут теж рахується як спроба', async () => {
    const tasks = [makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z')];
    const { deps, messenger } = setup(tasks, USERS);
    messenger.failFor('chat-anna', 'hang');

    await runDailyReminders(NOW, deps);
    await runDailyReminders(NOW, deps);
    const report3 = await runDailyReminders(NOW, deps);

    expect(report3.failed).toEqual([{ userId: 'anna', reason: 'timeout', final: true }]);
    expect(await deps.attemptLog.count('anna', '2026-03-10')).toBe(3);
  });

  it('успіх після двох невдалих спроб доставляє повідомлення', async () => {
    const tasks = [makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z')];
    const { deps, messenger } = setup(tasks, USERS);
    messenger.failFor('chat-anna', 'rate_limited');

    await runDailyReminders(NOW, deps);
    await runDailyReminders(NOW, deps);
    messenger.clearFailure('chat-anna');
    const report3 = await runDailyReminders(NOW, deps);

    expect(report3).toEqual({ sent: ['anna'], skipped: [], failed: [] });
    expect(sentChatIds(messenger)).toEqual(['chat-anna']);
  });
});

describe('runDailyReminders: погані дані', () => {
  it('тест брифу 8: старий запис без дедлайну і користувач без chat_id у skipped, запуск не падає', async () => {
    // Старі записи без полів: обходимо типи навмисно
    const noDeadline = { id: 'old1', assigneeId: 'anna', title: 'Стара задача', status: 'open' } as unknown as Task;
    const noAssignee = { id: 'old2', title: 'Нічия', deadline: new Date('2026-03-01T10:00:00Z'), status: 'open' } as unknown as Task;
    const noChatUser = { id: 'hryhorii' } as unknown as User;
    const users = [USERS[0], noChatUser] as User[];
    const tasks = [
      noDeadline,
      makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'hryhorii', 'Звіт', '2026-03-05T10:00:00Z'),
      makeTask('t3', 'nobody', 'Привид', '2026-03-05T10:00:00Z'),
      noAssignee,
    ];
    const { deps, messenger } = setup(tasks, users);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({
      sent: ['anna'],
      skipped: [
        { kind: 'task', id: 'old1', reason: 'no_deadline' },
        { kind: 'task', id: 'old2', reason: 'no_assignee' },
        { kind: 'user', id: 'hryhorii', reason: 'no_chat_id' },
        { kind: 'user', id: 'nobody', reason: 'user_not_found' },
      ],
      failed: [],
    });
    expect(messenger.attempts).toEqual(['chat-anna']);
  });
});

describe('runDailyReminders: другий рубіж для статусу, межі доби і chat_id', () => {
  it('задача done не надсилається, навіть якщо сховище її повернуло', async () => {
    const doneTask: Task = {
      id: 't1',
      assigneeId: 'anna',
      title: 'Вже зроблено',
      deadline: new Date('2026-03-01T10:00:00Z'),
      status: 'done',
    };
    const { deps, messenger } = setup([], USERS);
    // Сховище з помилкою: віддає і виконані задачі
    deps.taskRepo = {
      async listNotDone() {
        return [doneTask];
      },
    };

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({ sent: [], skipped: [], failed: [] });
    expect(messenger.attempts).toEqual([]);
  });

  it('дедлайн сьогодні вранці, до запуску, ще не прострочений', async () => {
    // 05:00 UTC = 07:00 10 березня за Києвом, запуск о 10:00 того ж дня
    const tasks = [
      makeTask('t1', 'anna', 'Сьогоднішня', '2026-03-10T05:00:00Z'),
      makeTask('t2', 'bohdan', 'Вчорашня', '2026-03-09T20:00:00Z'),
    ];
    const { deps, messenger } = setup(tasks, USERS);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({ sent: ['bohdan'], skipped: [], failed: [] });
    expect(messenger.sent).toEqual([
      { chatId: 'chat-bohdan', text: 'Прострочені задачі: 1\n1. Вчорашня (дедлайн 09.03.2026 22:00)' },
    ]);
  });

  it('користувач з порожнім chat_id у skipped, на порожню адресу нічого не шлемо', async () => {
    const users: User[] = [
      { id: 'anna', telegramChatId: '' },
      { id: 'bohdan', telegramChatId: 'chat-bohdan' },
    ];
    const tasks = [
      makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
    ];
    const { deps, messenger } = setup(tasks, users);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({
      sent: ['bohdan'],
      skipped: [{ kind: 'user', id: 'anna', reason: 'no_chat_id' }],
      failed: [],
    });
    expect(messenger.attempts).toEqual(['chat-bohdan']);
  });
});
