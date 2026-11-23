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
 * @see {@link ../src/ports.ts}
 * @see {@link ./faulty.ts}
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { runDailyReminders } from '../src/run.ts';
import type { RunDeps } from '../src/run.types.ts';
import { FakeTaskRepo, FakeUserRepo, FakeMessenger, FakeSentLog, FakeAttemptLog, FakeLock } from '../src/mocks.ts';
import type { Task, User, RunReport } from '../src/types.ts';
import type { TaskRepo, UserRepo, Messenger, SentLog } from '../src/ports.ts';
import {
  TaskRepoFailingOnce,
  TaskRepoWithDoneTasks,
  UserRepoFailingFor,
  SentLogFailingMarkFor,
  BrokenMessenger,
  SlowMessenger,
  CountingTaskRepo,
  SentLogFailingHasFor,
  AttemptLogFailingOn,
  RecordingLock,
  LockFailingOnAcquire,
  MessengerFailingWithCode,
  MessengerThrowingString,
  MessengerThrowingSync,
} from './faulty.ts';
import {
  makeTask,
  makeDoneTask,
  makeTaskWithoutDeadline,
  makeTaskWithoutAssignee,
  makeUser,
  makeUserWithoutChatId,
  makeTaskWithoutDeadlineAndAssignee,
  freezeTasks,
  freezeUsers,
} from './builders.ts';

// Рядки й числа не змінити, тож їх можна ділити між тестами
const DAY = '2026-03-10';
const SEND_TIMEOUT_MS = 10000;

// Об'єкти створюються наново в кожному тесті: тести не ділять дані

// 10:00 10 березня 2026 за Києвом
function nowAt10(): Date {
  return new Date('2026-03-10T08:00:00Z');
}

// Наступний запуск того ж дня, 10:30 за Києвом
function laterSameDay(): Date {
  return new Date('2026-03-10T08:30:00Z');
}

// Наступного дня о 10:00 за Києвом
function nextDay(): Date {
  return new Date('2026-03-11T08:00:00Z');
}

// Три користувачі з вигаданими chat_id
function threeUsers(): User[] {
  return [makeUser('anna'), makeUser('bohdan'), makeUser('vira')];
}

function emptyReport(): RunReport {
  return { sent: [], skipped: [], failed: [] };
}

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
  return buildDeps(new FakeTaskRepo(tasks), new FakeUserRepo(users), messenger, new FakeSentLog());
}

// Те саме, але сховища й месенджер задає сам тест (наприклад, зі збоєм)
function buildDeps(taskRepo: TaskRepo, userRepo: UserRepo, messenger: Messenger, sentLog: SentLog): RunDeps {
  const deps: RunDeps = {
    taskRepo: taskRepo,
    userRepo: userRepo,
    messenger: messenger,
    sentLog: sentLog,
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
    const deps = makeDeps(tasks, threeUsers(), messenger);

    // Act
    const report = await runDailyReminders(nowAt10(), deps);

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
    const deps = makeDeps(tasks, threeUsers(), messenger);

    const report = await runDailyReminders(nowAt10(), deps);

    expect(messenger.attempts).toEqual(['chat-anna']);
    expect(report).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });

  it('немає жодної задачі: нічого не шлемо, звіт порожній', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps([], threeUsers(), messenger);

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual(emptyReport());
    expect(messenger.attempts).toEqual([]);
  });

  it('у звіті немає chat_id і тексту повідомлень', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    messenger.failFor('chat-bohdan', 'rate_limited');

    const report = await runDailyReminders(nowAt10(), deps);

    const reportJson = JSON.stringify(report);
    expect(reportJson).not.toContain('chat-');
    expect(reportJson).not.toContain('Прострочені задачі');
  });
});

describe('runDailyReminders: дублі за день', () => {
  it('тест брифу 4: повторний запуск того ж дня не шле нічого', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    await runDailyReminders(nowAt10(), deps);

    const secondReport = await runDailyReminders(laterSameDay(), deps);

    expect(secondReport).toEqual(emptyReport());
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
  });

  it('позначка в SentLog ставиться на київську добу запуску', async () => {
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), new FakeMessenger());

    await runDailyReminders(nowAt10(), deps);

    expect(await deps.sentLog.has('anna', DAY)).toBe(true);
    expect(await deps.sentLog.has('anna', '2026-03-11')).toBe(false);
  });

  it('наступного дня нагадування знову йдуть', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    await runDailyReminders(nowAt10(), deps);

    const nextReport = await runDailyReminders(nextDay(), deps);

    expect(nextReport.sent).toEqual(['anna', 'bohdan', 'vira']);
    expect(messenger.sent.length).toBe(6);
  });
});

describe('runDailyReminders: блокування', () => {
  it('тест брифу 5: два запуски одночасно, кожен користувач отримує рівно одне повідомлення', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);

    const firstRun = runDailyReminders(nowAt10(), deps);
    const secondRun = runDailyReminders(nowAt10(), deps);
    const reports = await Promise.all([firstRun, secondRun]);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
    expect(reports[0]).toEqual({ sent: ['anna', 'bohdan', 'vira'], skipped: [], failed: [] });
    expect(reports[1]).toEqual(emptyReport());
  });

  it('якщо блокування цього дня вже тримає інший процес, запуск нічого не шле і не рахує спроб', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    await deps.lock.acquire('daily-reminders:' + DAY);

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual(emptyReport());
    expect(messenger.attempts).toEqual([]);
    expect(await deps.attemptLog.count('anna', DAY)).toBe(0);
  });

  it('блокування вчорашнього дня не заважає сьогоднішньому запуску', async () => {
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), new FakeMessenger());
    await deps.lock.acquire('daily-reminders:2026-03-09');

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.sent).toEqual(['anna', 'bohdan', 'vira']);
  });

  it('після звичайного запуску блокування знято', async () => {
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), new FakeMessenger());

    await runDailyReminders(nowAt10(), deps);

    expect(await deps.lock.acquire('daily-reminders:' + DAY)).toBe(true);
  });

  it('блокування знімається навіть після помилки, наступний запуск працює', async () => {
    const messenger = new FakeMessenger();
    const taskRepo = new TaskRepoFailingOnce(threeOverdueTasks());
    const deps = buildDeps(taskRepo, new FakeUserRepo(threeUsers()), messenger, new FakeSentLog());
    await expect(runDailyReminders(nowAt10(), deps)).rejects.toThrow('база недоступна');

    const report = await runDailyReminders(laterSameDay(), deps);

    expect(report.sent).toEqual(['anna', 'bohdan', 'vira']);
    expect(messenger.sent.length).toBe(3);
  });
});

describe('runDailyReminders: збій одному не зупиняє решту', () => {
  it('тест брифу 6: збій одному з трьох: двоє отримують, у нього немає позначки, наступний запуск шле лише йому', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    messenger.failFor('chat-bohdan', 'rate_limited');

    const firstReport = await runDailyReminders(nowAt10(), deps);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira']);
    expect(firstReport).toEqual({
      sent: ['anna', 'vira'],
      skipped: [],
      failed: [{ userId: 'bohdan', reason: 'rate_limited', final: false }],
    });
    expect(await deps.sentLog.has('bohdan', DAY)).toBe(false);
    expect(await deps.sentLog.has('anna', DAY)).toBe(true);

    messenger.clearFailure('chat-bohdan');
    const secondReport = await runDailyReminders(laterSameDay(), deps);

    expect(secondReport).toEqual({ sent: ['bohdan'], skipped: [], failed: [] });
    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira', 'chat-bohdan']);
  });

  it('невідома помилка месенджера записується як error', async () => {
    const taskRepo = new FakeTaskRepo(threeOverdueTasks());
    const deps = buildDeps(taskRepo, new FakeUserRepo(threeUsers()), new BrokenMessenger(), new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.sent).toEqual([]);
    expect(report.failed).toEqual([
      { userId: 'anna', reason: 'error', final: false },
      { userId: 'bohdan', reason: 'error', final: false },
      { userId: 'vira', reason: 'error', final: false },
    ]);
  });

  it('помилка UserRepo для одного користувача не зупиняє решту', async () => {
    const messenger = new FakeMessenger();
    const userRepo = new UserRepoFailingFor(threeUsers(), 'bohdan');
    const deps = buildDeps(new FakeTaskRepo(threeOverdueTasks()), userRepo, messenger, new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-vira']);
    expect(report.failed).toEqual([{ userId: 'bohdan', reason: 'error', final: false }]);
  });

  it('помилка SentLog.mark для одного користувача не зупиняє решту', async () => {
    const messenger = new FakeMessenger();
    const sentLog = new SentLogFailingMarkFor('anna');
    const deps = buildDeps(new FakeTaskRepo(threeOverdueTasks()), new FakeUserRepo(threeUsers()), messenger, sentLog);

    const report = await runDailyReminders(nowAt10(), deps);

    expect(sentChatIds(messenger)).toEqual(['chat-anna', 'chat-bohdan', 'chat-vira']);
    expect(report.sent).toEqual(['bohdan', 'vira']);
    expect(report.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
  });
});

describe('runDailyReminders: таймаут відправки', () => {
  it('зависла відправка обривається таймаутом і не зупиняє решту', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'hang');

    const report = await runWithFakeTimers(nowAt10(), deps);

    expect(report).toEqual({
      sent: ['bohdan', 'vira'],
      skipped: [],
      failed: [{ userId: 'anna', reason: 'timeout', final: false }],
    });
    expect(await deps.sentLog.has('anna', DAY)).toBe(false);
  });

  it('відповідь за мілісекунду до таймауту вважається успіхом', async () => {
    vi.useFakeTimers();
    const messenger = new SlowMessenger(SEND_TIMEOUT_MS - 1);
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), messenger, new FakeSentLog());

    const report = await runWithFakeTimers(nowAt10(), deps);

    expect(report).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });

  it('після невдалої відправки таймер таймауту теж прибрано', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'rate_limited');

    await runDailyReminders(nowAt10(), deps);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('після успішної відправки таймер таймауту прибрано', async () => {
    vi.useFakeTimers();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), new FakeMessenger());

    await runDailyReminders(nowAt10(), deps);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('після 403 таймер таймауту прибрано', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'blocked');

    await runDailyReminders(nowAt10(), deps);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('send падає одразу, без Promise: таймер прибрано, у звіті blocked', async () => {
    vi.useFakeTimers();
    const messenger = new MessengerThrowingSync(403);
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), messenger, new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.failed).toEqual([{ userId: 'anna', reason: 'blocked', final: true }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('send падає одразу з 429: таймер прибрано, спробуємо наступним запуском', async () => {
    vi.useFakeTimers();
    const messenger = new MessengerThrowingSync(429);
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), messenger, new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.failed).toEqual([{ userId: 'anna', reason: 'rate_limited', final: false }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('після однієї успішної відправки таймер таймауту прибрано', async () => {
    vi.useFakeTimers();
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), new FakeMessenger());

    await runDailyReminders(nowAt10(), deps);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('runDailyReminders: коди Telegram і ліміт спроб', () => {
  it('тест брифу 7: 403 остаточний одразу і не повторюється наступним запуском', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    messenger.failFor('chat-vira', 'blocked');

    const firstReport = await runDailyReminders(nowAt10(), deps);
    const secondReport = await runDailyReminders(laterSameDay(), deps);

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
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'blocked');
    await runDailyReminders(nowAt10(), deps);
    messenger.clearFailure('chat-anna');

    const secondReport = await runDailyReminders(laterSameDay(), deps);

    expect(secondReport.sent).toEqual([]);
    expect(messenger.sent).toEqual([]);
    expect(messenger.attempts).toEqual(['chat-anna']);
  });

  it('тест брифу 7: після трьох спроб з 429 користувач в остаточних failed', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
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
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'hang');

    await runWithFakeTimers(nowAt10(), deps);
    await runWithFakeTimers(nowAt10(), deps);
    const report3 = await runWithFakeTimers(nowAt10(), deps);

    expect(report3.failed).toEqual([{ userId: 'anna', reason: 'timeout', final: true }]);
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-anna', 'chat-anna']);
  });

  it('успіх після двох невдалих спроб доставляє повідомлення', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'rate_limited');
    await runDailyReminders(nowAt10(), deps);
    await runDailyReminders(nowAt10(), deps);
    messenger.clearFailure('chat-anna');

    const report3 = await runDailyReminders(nowAt10(), deps);

    expect(report3).toEqual({ sent: ['anna'], skipped: [], failed: [] });
    expect(sentChatIds(messenger)).toEqual(['chat-anna']);
  });

  it('ліміт спроб рахується окремо на кожен день: завтра знову пробуємо', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'rate_limited');
    await runDailyReminders(nowAt10(), deps);
    await runDailyReminders(nowAt10(), deps);
    await runDailyReminders(nowAt10(), deps);
    messenger.clearFailure('chat-anna');

    const nextDayReport = await runDailyReminders(nextDay(), deps);

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

    const report = await runDailyReminders(nowAt10(), deps);

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
    const deps = makeDeps(tasks, threeUsers(), messenger);

    const report = await runDailyReminders(nowAt10(), deps);

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

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual({
      sent: ['bohdan'],
      skipped: [{ kind: 'user', id: 'anna', reason: 'no_chat_id' }],
      failed: [],
    });
    expect(messenger.attempts).toEqual(['chat-bohdan']);
  });

  it('задача done не надсилається, навіть якщо сховище її повернуло', async () => {
    const messenger = new FakeMessenger();
    // Сховище з помилкою: віддає і виконані задачі
    const taskRepo = new TaskRepoWithDoneTasks([makeDoneTask('t1', 'anna', 'Вже зроблено', '2026-03-01T10:00:00Z')]);
    const deps = buildDeps(taskRepo, new FakeUserRepo(threeUsers()), messenger, new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual(emptyReport());
    expect(messenger.attempts).toEqual([]);
  });

  it('дедлайн сьогодні вранці, до запуску, ще не прострочений', async () => {
    // 05:00 UTC = 07:00 10 березня за Києвом, запуск о 10:00 того ж дня
    const tasks = [
      makeTask('t1', 'anna', 'Сьогоднішня', '2026-03-10T05:00:00Z'),
      makeTask('t2', 'bohdan', 'Вчорашня', '2026-03-09T20:00:00Z'),
    ];
    const messenger = new FakeMessenger();
    const deps = makeDeps(tasks, threeUsers(), messenger);

    const report = await runDailyReminders(nowAt10(), deps);

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

    await runDailyReminders(nowAt10(), deps);
    await runDailyReminders(laterSameDay(), deps);

    expect(tasks).toEqual([
      makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
      makeTask('t2', 'bohdan', 'Звіт', '2026-03-06T10:00:00Z'),
      makeTask('t3', 'vira', 'Договір', '2026-03-07T10:00:00Z'),
      makeTaskWithoutDeadline('t4', 'anna'),
    ]);
    expect(users).toEqual([makeUser('anna'), makeUser('bohdan'), makeUserWithoutChatId('vira')]);
  });

  it('кожен запуск повертає новий звіт: зміна одного не зачіпає інший', async () => {
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), new FakeMessenger());
    const firstReport = await runDailyReminders(nowAt10(), deps);

    firstReport.sent.push('чужий');
    const secondReport = await runDailyReminders(laterSameDay(), deps);

    expect(secondReport).toEqual(emptyReport());
  });

  it('звіт при зайнятому блокуванні теж новий щоразу', async () => {
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), new FakeMessenger());
    await deps.lock.acquire('daily-reminders:' + DAY);
    const firstReport = await runDailyReminders(nowAt10(), deps);

    firstReport.sent.push('чужий');
    const secondReport = await runDailyReminders(nowAt10(), deps);

    expect(secondReport).toEqual(emptyReport());
  });
});

describe('runDailyReminders: значення sendTimeoutMs', () => {
  it('береться саме з deps: таймаут 500, відповідь за 400 це успіх', async () => {
    vi.useFakeTimers();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(oneOverdueTaskForAnna()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: new SlowMessenger(400),
      sentLog: new FakeSentLog(),
      attemptLog: new FakeAttemptLog(),
      lock: new FakeLock(),
      sendTimeoutMs: 500,
    };

    const running = runDailyReminders(nowAt10(), deps);
    await vi.advanceTimersByTimeAsync(500);
    const report = await running;

    expect(report).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });

  it('береться саме з deps: таймаут 500, відповідь за 600 це timeout', async () => {
    vi.useFakeTimers();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(oneOverdueTaskForAnna()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: new SlowMessenger(600),
      sentLog: new FakeSentLog(),
      attemptLog: new FakeAttemptLog(),
      lock: new FakeLock(),
      sendTimeoutMs: 500,
    };

    const running = runDailyReminders(nowAt10(), deps);
    await vi.advanceTimersByTimeAsync(600);
    const report = await running;

    expect(report).toEqual({ sent: [], skipped: [], failed: [{ userId: 'anna', reason: 'timeout', final: false }] });
  });

  it('береться саме з deps: таймаут 20000, відповідь за 15000 це успіх', async () => {
    vi.useFakeTimers();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(oneOverdueTaskForAnna()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: new SlowMessenger(15000),
      sentLog: new FakeSentLog(),
      attemptLog: new FakeAttemptLog(),
      lock: new FakeLock(),
      sendTimeoutMs: 20000,
    };

    const running = runDailyReminders(nowAt10(), deps);
    await vi.advanceTimersByTimeAsync(20000);
    const report = await running;

    expect(report).toEqual({ sent: ['anna'], skipped: [], failed: [] });
  });

  it('відповідь рівно на межі таймауту вже timeout: таймер ставиться першим', async () => {
    vi.useFakeTimers();
    const messenger = new SlowMessenger(SEND_TIMEOUT_MS);
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), messenger, new FakeSentLog());

    const report = await runWithFakeTimers(nowAt10(), deps);

    expect(report.failed).toEqual([{ userId: 'anna', reason: 'timeout', final: false }]);
  });

  it('перший і другий таймаут не остаточні, третій остаточний', async () => {
    vi.useFakeTimers();
    const messenger = new FakeMessenger();
    const deps = makeDeps(oneOverdueTaskForAnna(), threeUsers(), messenger);
    messenger.failFor('chat-anna', 'hang');

    const report1 = await runWithFakeTimers(nowAt10(), deps);
    const report2 = await runWithFakeTimers(nowAt10(), deps);
    const report3 = await runWithFakeTimers(nowAt10(), deps);

    expect(report1.failed).toEqual([{ userId: 'anna', reason: 'timeout', final: false }]);
    expect(report2.failed).toEqual([{ userId: 'anna', reason: 'timeout', final: false }]);
    expect(report3.failed).toEqual([{ userId: 'anna', reason: 'timeout', final: true }]);
  });
});

describe('runDailyReminders: інші коди і помилки Telegram', () => {
  it('код 400 це error, не blocked: наступний запуск пробує знову', async () => {
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), new MessengerFailingWithCode(400), new FakeSentLog());

    const report1 = await runDailyReminders(nowAt10(), deps);
    const report2 = await runDailyReminders(laterSameDay(), deps);

    expect(report1.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
    expect(report2.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
  });

  it('код 401 це error, не blocked', async () => {
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), new MessengerFailingWithCode(401), new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
  });

  it('код 500 це error, не rate_limited', async () => {
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), new MessengerFailingWithCode(500), new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
  });

  it('код 428 (сусід 429) це error', async () => {
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), new MessengerFailingWithCode(428), new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
  });

  it('третя помилка 500 остаточна, як і для 429', async () => {
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), new MessengerFailingWithCode(500), new FakeSentLog());

    await runDailyReminders(nowAt10(), deps);
    await runDailyReminders(nowAt10(), deps);
    const report3 = await runDailyReminders(nowAt10(), deps);

    expect(report3.failed).toEqual([{ userId: 'anna', reason: 'error', final: true }]);
  });

  it('кинутий рядок замість помилки це error', async () => {
    const deps = buildDeps(new FakeTaskRepo(oneOverdueTaskForAnna()), new FakeUserRepo(threeUsers()), new MessengerThrowingString(), new FakeSentLog());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.failed).toEqual([{ userId: 'anna', reason: 'error', final: false }]);
  });
});

describe('runDailyReminders: збій кожного методу сховища', () => {
  it('SentLog.has падає для одного: йому error, без відправки, решта отримують', async () => {
    const messenger = new FakeMessenger();
    const deps = buildDeps(new FakeTaskRepo(threeOverdueTasks()), new FakeUserRepo(threeUsers()), messenger, new SentLogFailingHasFor('bohdan'));

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual({ sent: ['anna', 'vira'], skipped: [], failed: [{ userId: 'bohdan', reason: 'error', final: false }] });
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-vira']);
  });

  it('AttemptLog.isStopped падає для одного: йому error, без відправки', async () => {
    const messenger = new FakeMessenger();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(threeOverdueTasks()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: messenger,
      sentLog: new FakeSentLog(),
      attemptLog: new AttemptLogFailingOn('isStopped', 'bohdan'),
      lock: new FakeLock(),
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual({ sent: ['anna', 'vira'], skipped: [], failed: [{ userId: 'bohdan', reason: 'error', final: false }] });
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-vira']);
  });

  it('AttemptLog.add падає для одного: йому error, без відправки', async () => {
    const messenger = new FakeMessenger();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(threeOverdueTasks()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: messenger,
      sentLog: new FakeSentLog(),
      attemptLog: new AttemptLogFailingOn('add', 'bohdan'),
      lock: new FakeLock(),
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual({ sent: ['anna', 'vira'], skipped: [], failed: [{ userId: 'bohdan', reason: 'error', final: false }] });
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-vira']);
  });

  it('AttemptLog.count падає для одного: йому error, без відправки', async () => {
    const messenger = new FakeMessenger();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(threeOverdueTasks()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: messenger,
      sentLog: new FakeSentLog(),
      attemptLog: new AttemptLogFailingOn('count', 'bohdan'),
      lock: new FakeLock(),
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual({ sent: ['anna', 'vira'], skipped: [], failed: [{ userId: 'bohdan', reason: 'error', final: false }] });
    expect(messenger.attempts).toEqual(['chat-anna', 'chat-vira']);
  });

  it('AttemptLog.stop падає після 403: у звіті error, не blocked, решта отримують', async () => {
    const messenger = new FakeMessenger();
    messenger.failFor('chat-bohdan', 'blocked');
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(threeOverdueTasks()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: messenger,
      sentLog: new FakeSentLog(),
      attemptLog: new AttemptLogFailingOn('stop', 'bohdan'),
      lock: new FakeLock(),
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual({ sent: ['anna', 'vira'], skipped: [], failed: [{ userId: 'bohdan', reason: 'error', final: false }] });
  });
});

describe('runDailyReminders: блокування, кожна змінна', () => {
  it('ключ блокування за київською добою: о 00:30 за Києвом це вже нова доба', async () => {
    // 22:30 UTC 9 березня = 00:30 10 березня за Києвом
    const lock = new RecordingLock();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(oneOverdueTaskForAnna()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: new FakeMessenger(),
      sentLog: new FakeSentLog(),
      attemptLog: new FakeAttemptLog(),
      lock: lock,
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    await runDailyReminders(new Date('2026-03-09T22:30:00Z'), deps);

    expect(lock.acquired).toEqual(['daily-reminders:2026-03-10']);
    expect(lock.released).toEqual(['daily-reminders:2026-03-10']);
  });

  it('знімається той самий ключ, що й брався, рівно один раз', async () => {
    const lock = new RecordingLock();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(threeOverdueTasks()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: new FakeMessenger(),
      sentLog: new FakeSentLog(),
      attemptLog: new FakeAttemptLog(),
      lock: lock,
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    await runDailyReminders(nowAt10(), deps);

    expect(lock.acquired).toEqual(['daily-reminders:' + DAY]);
    expect(lock.released).toEqual(['daily-reminders:' + DAY]);
  });

  it('чуже блокування запуск не знімає: після нього воно досі зайняте', async () => {
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), new FakeMessenger());
    await deps.lock.acquire('daily-reminders:' + DAY);

    await runDailyReminders(nowAt10(), deps);

    expect(await deps.lock.acquire('daily-reminders:' + DAY)).toBe(false);
  });

  it('запуск не знімає блокування іншого дня', async () => {
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), new FakeMessenger());
    await deps.lock.acquire('daily-reminders:2026-03-09');

    await runDailyReminders(nowAt10(), deps);

    expect(await deps.lock.acquire('daily-reminders:2026-03-09')).toBe(false);
  });

  it('при зайнятому блокуванні задачі навіть не читаються', async () => {
    const taskRepo = new CountingTaskRepo(threeOverdueTasks());
    const deps = buildDeps(taskRepo, new FakeUserRepo(threeUsers()), new FakeMessenger(), new FakeSentLog());
    await deps.lock.acquire('daily-reminders:' + DAY);

    await runDailyReminders(nowAt10(), deps);

    expect(taskRepo.calls).toBe(0);
  });

  it('звичайний запуск читає задачі рівно один раз', async () => {
    const taskRepo = new CountingTaskRepo(threeOverdueTasks());
    const deps = buildDeps(taskRepo, new FakeUserRepo(threeUsers()), new FakeMessenger(), new FakeSentLog());

    await runDailyReminders(nowAt10(), deps);

    expect(taskRepo.calls).toBe(1);
  });

  it('acquire падає: запуск падає, задачі не читаються, release не викликається', async () => {
    const taskRepo = new CountingTaskRepo(threeOverdueTasks());
    const lock = new LockFailingOnAcquire();
    const messenger = new FakeMessenger();
    const deps: RunDeps = {
      taskRepo: taskRepo,
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: messenger,
      sentLog: new FakeSentLog(),
      attemptLog: new FakeAttemptLog(),
      lock: lock,
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    await expect(runDailyReminders(nowAt10(), deps)).rejects.toThrow('блокування недоступне');

    expect(taskRepo.calls).toBe(0);
    expect(lock.released).toEqual([]);
    expect(messenger.attempts).toEqual([]);
  });
});

describe('runDailyReminders: кожне поле користувача і звіту', () => {
  it('повідомлення йде на chat_id з UserRepo, а не на id користувача', async () => {
    const messenger = new FakeMessenger();
    const users: User[] = [{ id: 'anna', telegramChatId: 'tg-777' }];
    const deps = makeDeps(oneOverdueTaskForAnna(), users, messenger);

    const report = await runDailyReminders(nowAt10(), deps);

    expect(messenger.attempts).toEqual(['tg-777']);
    expect(report.sent).toEqual(['anna']);
  });

  it('спроби рахуються окремо для кожного користувача', async () => {
    const messenger = new FakeMessenger();
    const deps = makeDeps(threeOverdueTasks(), threeUsers(), messenger);
    // У Анни сьогодні вже були дві невдалі спроби, у Богдана жодної
    await deps.attemptLog.add('anna', DAY);
    await deps.attemptLog.add('anna', DAY);
    messenger.failFor('chat-anna', 'rate_limited');
    messenger.failFor('chat-bohdan', 'rate_limited');

    const report = await runDailyReminders(nowAt10(), deps);

    // Анна втретє, Богдан уперше
    expect(report.failed).toEqual([
      { userId: 'anna', reason: 'rate_limited', final: true },
      { userId: 'bohdan', reason: 'rate_limited', final: false },
    ]);
  });

  it('задача без дедлайну і без виконавця у звіті одним рядком з no_deadline', async () => {
    const deps = makeDeps([makeTaskWithoutDeadlineAndAssignee('t9')], threeUsers(), new FakeMessenger());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report).toEqual({ sent: [], skipped: [{ kind: 'task', id: 't9', reason: 'no_deadline' }], failed: [] });
  });

  it('у звіті спершу пропущені задачі, потім пропущені користувачі', async () => {
    const users = [makeUserWithoutChatId('anna')];
    const tasks = [
      makeTask('t1', 'anna', 'Рахунок', '2026-03-05T10:00:00Z'),
      makeTaskWithoutDeadline('t2', 'anna'),
    ];
    const deps = makeDeps(tasks, users, new FakeMessenger());

    const report = await runDailyReminders(nowAt10(), deps);

    expect(report.skipped).toEqual([
      { kind: 'task', id: 't2', reason: 'no_deadline' },
      { kind: 'user', id: 'anna', reason: 'no_chat_id' },
    ]);
  });

  it('невалідний now: запуск падає з RangeError і блокування не бере', async () => {
    const lock = new RecordingLock();
    const deps: RunDeps = {
      taskRepo: new FakeTaskRepo(threeOverdueTasks()),
      userRepo: new FakeUserRepo(threeUsers()),
      messenger: new FakeMessenger(),
      sentLog: new FakeSentLog(),
      attemptLog: new FakeAttemptLog(),
      lock: lock,
      sendTimeoutMs: SEND_TIMEOUT_MS,
    };

    await expect(runDailyReminders(new Date('не дата'), deps)).rejects.toThrow(RangeError);

    expect(lock.acquired).toEqual([]);
  });
});
