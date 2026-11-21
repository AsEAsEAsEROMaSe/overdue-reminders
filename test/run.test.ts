/**
 * @file Тести одного запуску нагадувань: доставка, дублі, блокування, збої, спроби, погані дані.
 * @module run.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/run.ts}
 * @see {@link ../src/run.types.ts}
 * @see {@link ../src/mocks.ts}
 * @see {@link ../src/types.ts}
 * @see {@link ./builders.ts}
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { runDailyReminders } from '../src/run.ts';
import type { RunDeps } from '../src/run.types.ts';
import { FakeTaskRepo, FakeUserRepo, FakeMessenger, FakeSentLog, FakeAttemptLog, FakeLock } from '../src/mocks.ts';
import type { Task, User, RunReport } from '../src/types.ts';
import {
  makeTask,
  makeDoneTask,
  makeTaskWithoutDeadline,
  makeTaskWithoutAssignee,
  makeUser,
  makeUserWithoutChatId,
  freezeTasks,
  freezeUsers,
} from './builders.ts';

// 10:00 10 березня 2026 за Києвом
const NOW = new Date('2026-03-10T08:00:00Z');
// Наступний запуск того ж дня, 10:30 за Києвом
const LATER_SAME_DAY = new Date('2026-03-10T08:30:00Z');
// Наступного дня о 10:00 за Києвом
const NEXT_DAY = new Date('2026-03-11T08:00:00Z');
const DAY = '2026-03-10';
const SEND_TIMEOUT_MS = 10000;

const USERS: User[] = [makeUser('anna'), makeUser('bohdan'), makeUser('vira')];

const EMPTY_REPORT: RunReport = { sent: [], skipped: [], failed: [] };

// По одній простроченій задачі на кожного з трьох користувачів
function threeOverdueTasks(): Task[] {
  return [
    makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
    makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
    makeTask('t3', 'vira', 'Договір', '2026-03-07T10:00:00Z'),
  ];
}

function oneOverdueTaskForAnna(): Task[] {
  return [makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z')];
}

// Свіжі моки на кожен тест: тести не ділять стан між собою.
// Месенджер передаємо ззовні, щоб тест міг дивитись, що відправлено
function makeDeps(tasks: Task[], users: User[], messenger: FakeMessenger): RunDeps {
  const deps: RunDeps = {
    taskRepo: new FakeTaskRepo(tasks),
    userRepo: new FakeUserRepo(users),
    messenger: messenger,
    sentLog: new FakeSentLog(),
    attemptLog: new FakeAttemptLog(),
    lock: new FakeLock(),
    sendTimeoutMs: SEND_TIMEOUT_MS,
  };
  return deps;
}

// chat_id усіх доставлених повідомлень по порядку
function sentChatIds(messenger: FakeMessenger): string[] {
  const result: string[] = [];
  for (const message of messenger.sent) {
    result.push(message.chatId);
  }
  return result;
}

// Запуск з підробленим годинником: прокручує час на весь таймаут,
// тож зависла відправка обривається без справжнього очікування
async function runWithFakeTimers(now: Date, deps: RunDeps): Promise<RunReport> {
  const running = runDailyReminders(now, deps);
  await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
  return running;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runDailyReminders: доставка', () => {
  it('кожен отримує одне повідомлення зі своїми задачами від найстарішої', async () => {
    // Arrange
    const tasks = [
      makeTask('t1', 'anna', 'Пізніша', '2026-03-08T10:00:00Z'),
      makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
      makeTask('t3', 'anna', 'Раніша', '2026-03-02T10:00:00Z'),
    ];
    const messenger = new FakeMessenger();
    const deps = makeDeps(tasks, USERS, messenger);

    // Act
    const report = await runDailyReminders(NOW, deps);

    // Assert
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
    const messenger = new FakeMessenger();
    const deps = makeDeps(tasks, USERS, messenger);

    const report = await runDailyReminders(NOW, deps);

    expect(messenger.attempts).toEqual(['chat-anna']);
    expect(report).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });

  it('немає жодної задачі: нічого не шлемо, звіт порожній', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps([], USERS, messenger);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual(EMPTY_REPORT);
    expect(messenger.attempts).toEqual([]);
  });

  it('у звіті немає chat_id і тексту повідомлень', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    messenger.failFor('chat-bohdan', 'rate_limited');

    const report = await runDailyReminders(NOW, deps);

    const reportJson = JSON.stringify(report);
    expect(reportJson).not.toContain('chat-');
    expect(reportJson).not.toContain('Прострочені задачі');
  });
});

describe('runDailyReminders: дублі за день', () => {
  it('тест брифу 4: повторний запуск того ж дня не шле нічого', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    await runDailyReminders(NOW, deps);

    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(secondReport).toEqual(EMPTY_REPORT);
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
  });

  it('позначка в SentLog ставиться на київську добу запуску', async () => {
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, new FakeMessenger());

    await runDailyReminders(NOW, deps);

    expect(await deps.sentLog.has('anna', DAY)).toBe(true);
    expect(await deps.sentLog.has('anna', '2026-03-11')).toBe(false);
  });

  it('наступного дня нагадування знову йдуть', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    await runDailyReminders(NOW, deps);

    const nextReport = await runDailyReminders(NEXT_DAY, deps);

    expect(nextReport.sent).toEqual(['anna', 'bohdan', 'vira']);
    expect(messenger.sent.length).toBe(6);
  });
});

describe('runDailyReminders: блокування', () => {
  it('тест брифу 5: два запуски одночасно, кожен користувач отримує рівно одне повідомлення', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);

    const firstRun = runDailyReminders(NOW, deps);
    const secondRun = runDailyReminders(NOW, deps);
    const reports = await Promise.all([firstRun, secondRun]);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
    expect(reports[0]).toEqual({ sent: ['anna', 'bohdan', 'vira'], skipped: [], failed: [] });
    expect(reports[1]).toEqual(EMPTY_REPORT);
  });

  it('якщо блокування цього дня вже тримає інший процес, запуск нічого не шле і не рахує спроб', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    await deps.lock.acquire('daily-reminders:' + DAY);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual(EMPTY_REPORT);
    expect(messenger.attempts).toEqual([]);
    expect(await deps.attemptLog.count('anna', DAY)).toBe(0);
  });

  it('блокування вчорашнього дня не заважає сьогоднішньому запуску', async () => {
    const deps = makeDeps(threeOverdueTasks(), USERS, new FakeMessenger());
    await deps.lock.acquire('daily-reminders:2026-03-09');

    const report = await runDailyReminders(NOW, deps);

    expect(report.sent).toEqual(['anna', 'bohdan', 'vira']);
  });

  it('після звичайного запуску блокування знято', async () => {
    const deps = makeDeps(threeOverdueTasks(), USERS, new FakeMessenger());

    await runDailyReminders(NOW, deps);

    expect(await deps.lock.acquire('daily-reminders:' + DAY)).toBe(true);
  });

  it('блокування знімається навіть після помилки, наступний запуск працює', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
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

describe('runDailyReminders: збій одному не зупиняє решту', () => {
  it('тест брифу 6: збій одному з трьох: двоє отримують, у нього немає позначки, наступний запуск шле лише йому', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    messenger.failFor('chat-bohdan', 'rate_limited');

    const firstReport = await runDailyReminders(NOW, deps);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira']);
    expect(firstReport).toEqual({
      sent: ['anna', 'vira'],
      skipped: [],
      failed: [{ userId: 'bohdan', reason: 'rate_limited', final: false }],
    });
    expect(await deps.sentLog.has('bohdan', DAY)).toBe(false);
    expect(await deps.sentLog.has('anna', DAY)).toBe(true);

    messenger.clearFailure('chat-bohdan');
    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(secondReport).toEqual({ sent: ['bohdan'], skipped: [], failed: [] });
    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira', 'chat-bohdan']);
  });

  it('невідома помилка месенджера записується як error', async () => {
    const deps = makeDeps(threeOverdueTasks(), USERS, new FakeMessenger());
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

  it('помилка UserRepo для одного користувача не зупиняє решту', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    const realUserRepo = deps.userRepo;
    deps.userRepo = {
      async get(id: string) {
        if (id === 'bohdan') {
          throw new Error('база недоступна');
        }
        return realUserRepo.get(id);
      },
    };

    const report = await runDailyReminders(NOW, deps);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira']);
    expect(report.failed).toEqual([{ userId: 'bohdan', reason: 'error', final: false }]);
  });

  it('помилка SentLog.mark для одного користувача не зупиняє решту', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    const realSentLog = deps.sentLog;
    deps.sentLog = {
      async has(userId: string, day: string) {
        return realSentLog.has(userId, day);
      },
      async mark(userId: string, day: string) {
        if (userId === 'anna') {
          throw new Error('журнал недоступний');
        }
        return realSentLog.mark(userId, day);
      },
    };

    const report = await runDailyReminders(NOW, deps);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
    expect(report.sent).toEqual(['bohdan', 'vira']);
    expect(report.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
  });
});

describe('runDailyReminders: таймаут відправки', () => {
  it('зависла відправка обривається таймаутом і не зупиняє решту', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
    messenger.failFor('chat-anna', 'hang');

    const report = await runWithFakeTimers(NOW, deps);

    expect(report).toEqual({
      sent: ['bohdan', 'vira'],
      skipped: [],
      failed: [{ userId: 'anna', reason: 'timeout', final: false }],
    });
    expect(await deps.sentLog.has('anna', DAY)).toBe(false);
  });

  it('відповідь за мілісекунду до таймауту вважається успіхом', async () => {
    vi.useFakeTimers();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, new FakeMessenger());
    deps.messenger = {
      async send() {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, SEND_TIMEOUT_MS - 1);
        });
      },
    };

    const report = await runWithFakeTimers(NOW, deps);

    expect(report).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });

  it('після невдалої відправки таймер таймауту теж прибрано', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, messenger);
    messenger.failFor('chat-anna', 'rate_limited');

    await runDailyReminders(NOW, deps);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('після успішної відправки таймер таймауту прибрано', async () => {
    vi.useFakeTimers();
    const deps = makeDeps(threeOverdueTasks(), USERS, new FakeMessenger());

    await runDailyReminders(NOW, deps);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('після 403 таймер таймауту прибрано', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, messenger);
    messenger.failFor('chat-anna', 'blocked');

    await runDailyReminders(NOW, deps);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('після однієї успішної відправки таймер таймауту прибрано', async () => {
    vi.useFakeTimers();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, new FakeMessenger());

    await runDailyReminders(NOW, deps);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('runDailyReminders: коди Telegram і ліміт спроб', () => {
  it('тест брифу 7: 403 остаточний одразу і не повторюється наступним запуском', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), USERS, messenger);
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
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, messenger);
    messenger.failFor('chat-anna', 'blocked');
    await runDailyReminders(NOW, deps);
    messenger.clearFailure('chat-anna');

    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(secondReport.sent).toEqual([]);
    expect(messenger.sent).toEqual([]);
    expect(messenger.attempts).toEqual(['chat-anna']);
  });

  it('тест брифу 7: після трьох спроб з 429 користувач в остаточних failed', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, messenger);
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

  it('таймаут теж рахується як спроба: третій таймаут остаточний', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, messenger);
    messenger.failFor('chat-anna', 'hang');

    await runWithFakeTimers(NOW, deps);
    await runWithFakeTimers(NOW, deps);
    const report3 = await runWithFakeTimers(NOW, deps);

    expect(report3.failed).toEqual([{ userId: 'anna', reason: 'timeout', final: true }]);
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-anna', 'chat-anna']);
  });

  it('успіх після двох невдалих спроб доставляє повідомлення', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, messenger);
    messenger.failFor('chat-anna', 'rate_limited');
    await runDailyReminders(NOW, deps);
    await runDailyReminders(NOW, deps);
    messenger.clearFailure('chat-anna');

    const report3 = await runDailyReminders(NOW, deps);

    expect(report3).toEqual({ sent: ['anna'], skipped: [], failed: [] });
    expect(sentChatIds(messenger)).toEqual(['chat-anna']);
  });

  it('ліміт спроб рахується окремо на кожен день: завтра знову пробуємо', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), USERS, messenger);
    messenger.failFor('chat-anna', 'rate_limited');
    await runDailyReminders(NOW, deps);
    await runDailyReminders(NOW, deps);
    await runDailyReminders(NOW, deps);
    messenger.clearFailure('chat-anna');

    const nextDayReport = await runDailyReminders(NEXT_DAY, deps);

    expect(nextDayReport).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });
});

describe('runDailyReminders: погані дані', () => {
  it('тест брифу 8: старий запис без дедлайну і користувач без chat_id у skipped, запуск не падає', async () => {
    const users = [makeUser('anna'), makeUserWithoutChatId('hryhorii')];
    const tasks = [
      makeTaskWithoutDeadline('old1', 'anna'),
      makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'hryhorii', 'Звіт', '2026-03-05T10:00:00Z'),
      makeTask('t3', 'nobody', 'Привид', '2026-03-05T10:00:00Z'),
      makeTaskWithoutAssignee('old2', '2026-03-01T10:00:00Z'),
    ];
    const messenger = new FakeMessenger();
    const deps = makeDeps(tasks, users, messenger);

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

  it('задачі виконавця, якого немає серед користувачів, у skipped, решта отримують', async () => {
    const tasks = [
      makeTask('t1', 'ghost', 'Привид', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
    ];
    const messenger = new FakeMessenger();
    const deps = makeDeps(tasks, USERS, messenger);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({
      sent: ['anna'],
      skipped: [{ kind: 'user', id: 'ghost', reason: 'user_not_found' }],
      failed: [],
    });
    expect(messenger.attempts).toEqual(['chat-anna']);
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
    const messenger = new FakeMessenger();
    const deps = makeDeps(tasks, users, messenger);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({
      sent: ['bohdan'],
      skipped: [{ kind: 'user', id: 'anna', reason: 'no_chat_id' }],
      failed: [],
    });
    expect(messenger.attempts).toEqual(['chat-bohdan']);
  });

  it('задача done не надсилається, навіть якщо сховище її повернуло', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps([], USERS, messenger);
    // Сховище з помилкою: віддає і виконані задачі
    deps.taskRepo = {
      async listNotDone() {
        return [makeDoneTask('t1', 'anna', 'Вже зроблено', '2026-03-01T10:00:00Z')];
      },
    };

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual(EMPTY_REPORT);
    expect(messenger.attempts).toEqual([]);
  });

  it('дедлайн сьогодні вранці, до запуску, ще не прострочений', async () => {
    // 05:00 UTC = 07:00 10 березня за Києвом, запуск о 10:00 того ж дня
    const tasks = [
      makeTask('t1', 'anna', 'Сьогоднішня', '2026-03-10T05:00:00Z'),
      makeTask('t2', 'bohdan', 'Вчорашня', '2026-03-09T20:00:00Z'),
    ];
    const messenger = new FakeMessenger();
    const deps = makeDeps(tasks, USERS, messenger);

    const report = await runDailyReminders(NOW, deps);

    expect(report).toEqual({ sent: ['bohdan'], skipped: [], failed: [] });
    expect(messenger.sent).toEqual([
      { chatId: 'chat-bohdan', text: 'Прострочені задачі: 1\n1. Вчорашня (дедлайн 09.03.2026 22:00)' },
    ]);
  });
});

describe('runDailyReminders: вхідні дані не змінюються', () => {
  it('задачі і користувачі лишаються як були після двох запусків зі збоями', async () => {
    const tasks = freezeTasks([
      makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
      makeTask('t3', 'vira', 'Договір', '2026-03-07T10:00:00Z'),
      makeTaskWithoutDeadline('t4', 'anna'),
    ]);
    const users = freezeUsers([makeUser('anna'), makeUser('bohdan'), makeUserWithoutChatId('vira')]);
    const messenger = new FakeMessenger();
    messenger.failFor('chat-bohdan', 'blocked');
    const deps = makeDeps(tasks, users, messenger);

    await runDailyReminders(NOW, deps);
    await runDailyReminders(LATER_SAME_DAY, deps);

    expect(tasks).toEqual([
      makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
      makeTask('t3', 'vira', 'Договір', '2026-03-07T10:00:00Z'),
      makeTaskWithoutDeadline('t4', 'anna'),
    ]);
    expect(users).toEqual([makeUser('anna'), makeUser('bohdan'), makeUserWithoutChatId('vira')]);
  });

  it('кожен запуск повертає новий звіт: зміна одного не зачіпає інший', async () => {
    const deps = makeDeps(threeOverdueTasks(), USERS, new FakeMessenger());
    const firstReport = await runDailyReminders(NOW, deps);

    firstReport.sent.push('чужий');
    const secondReport = await runDailyReminders(LATER_SAME_DAY, deps);

    expect(secondReport).toEqual(EMPTY_REPORT);
  });

  it('звіт при зайнятому блокуванні теж новий щоразу', async () => {
    const deps = makeDeps(threeOverdueTasks(), USERS, new FakeMessenger());
    await deps.lock.acquire('daily-reminders:' + DAY);
    const firstReport = await runDailyReminders(NOW, deps);

    firstReport.sent.push('чужий');
    const secondReport = await runDailyReminders(NOW, deps);

    expect(secondReport).toEqual(EMPTY_REPORT);
  });
});
