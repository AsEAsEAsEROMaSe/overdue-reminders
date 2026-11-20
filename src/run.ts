/**
 * @file Один запуск щоденних нагадувань: runDailyReminders(now, deps).
 * @module run
 *
 * Головний (хто використовує):
 * @see {@link ../test/run.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./ports.ts}
 * @see {@link ./types.ts}
 * @see {@link ./time.ts}
 * @see {@link ./overdue.ts}
 * @see {@link ./format.ts}
 */

import type { TaskRepo, UserRepo, Messenger, SentLog, AttemptLog, Lock } from './ports.ts';
import { TelegramError } from './types.ts';
import type { RunReport } from './types.ts';
import { kyivDay } from './time.ts';
import { groupOverdueByUser } from './overdue.ts';
import { buildReminderText } from './format.ts';

const DEFAULT_SEND_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;

export interface RunDeps {
  taskRepo: TaskRepo;
  userRepo: UserRepo;
  messenger: Messenger;
  sentLog: SentLog;
  attemptLog: AttemptLog;
  lock: Lock;
  // Скільки чекати відповіді Telegram; за замовчуванням 10 секунд
  sendTimeoutMs?: number;
}

// Один запуск; якщо інший запуск того ж дня вже йде, нічого не робить
export async function runDailyReminders(now: Date, deps: RunDeps): Promise<RunReport> {
  const day = kyivDay(now);
  const lockKey = 'daily-reminders:' + day;

  const acquired = await deps.lock.acquire(lockKey);
  if (!acquired) {
    return { sent: [], skipped: [], failed: [] };
  }

  try {
    return await sendReminders(now, day, deps);
  } finally {
    await deps.lock.release(lockKey);
  }
}

// Вибирає прострочені задачі і шле кожному виконавцю одне повідомлення
async function sendReminders(now: Date, day: string, deps: RunDeps): Promise<RunReport> {
  const report: RunReport = { sent: [], skipped: [], failed: [] };

  const tasks = await deps.taskRepo.listNotDone();
  const overdue = groupOverdueByUser(tasks, now);

  for (const group of overdue.groups) {
    const user = await deps.userRepo.get(group.userId);
    if (user === undefined) {
      continue;
    }
    const alreadySent = await deps.sentLog.has(group.userId, day);
    if (alreadySent) {
      continue;
    }

    // Не більше MAX_ATTEMPTS спроб на користувача за день
    const attemptsBefore = await deps.attemptLog.count(group.userId, day);
    if (attemptsBefore >= MAX_ATTEMPTS) {
      report.failed.push({ userId: group.userId, reason: 'attempts_exhausted', final: true });
      continue;
    }
    const attempts = attemptsBefore + 1;
    await deps.attemptLog.set(group.userId, day, attempts);

    const text = buildReminderText(group.tasks);
    let outcome = '';
    try {
      outcome = await sendWithTimeout(deps.messenger, user.telegramChatId, text, getTimeoutMs(deps));
    } catch (error) {
      // Збій одному користувачу не зупиняє решту; mark не ставимо, наступний запуск повторить
      const reason = getErrorReason(error);
      if (reason === 'blocked') {
        // 403: бот заблокований, сьогодні більше не пробуємо
        await deps.attemptLog.set(group.userId, day, MAX_ATTEMPTS);
        report.failed.push({ userId: group.userId, reason: reason, final: true });
        continue;
      }
      report.failed.push({ userId: group.userId, reason: reason, final: isLastAttempt(attempts) });
      continue;
    }
    if (outcome === 'timeout') {
      report.failed.push({ userId: group.userId, reason: 'timeout', final: isLastAttempt(attempts) });
      continue;
    }
    await deps.sentLog.mark(group.userId, day);
    report.sent.push(group.userId);
  }

  return report;
}

function isLastAttempt(attempts: number): boolean {
  if (attempts >= MAX_ATTEMPTS) {
    return true;
  }
  return false;
}

function getTimeoutMs(deps: RunDeps): number {
  if (deps.sendTimeoutMs === undefined) {
    return DEFAULT_SEND_TIMEOUT_MS;
  }
  return deps.sendTimeoutMs;
}

// Причина збою для звіту: 429 rate_limited, 403 blocked, інше error
function getErrorReason(error: unknown): string {
  if (error instanceof TelegramError) {
    if (error.code === 429) {
      return 'rate_limited';
    }
    if (error.code === 403) {
      return 'blocked';
    }
  }
  return 'error';
}

async function sendAndConfirm(messenger: Messenger, chatId: string, text: string): Promise<string> {
  await messenger.send(chatId, text);
  return 'sent';
}

// Шле повідомлення; повертає 'sent' або 'timeout'; помилку Telegram кидає далі
async function sendWithTimeout(messenger: Messenger, chatId: string, text: string, timeoutMs: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  const timeoutPromise = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      resolve('timeout');
    }, timeoutMs);
  });
  const sendPromise = sendAndConfirm(messenger, chatId, text);
  try {
    return await Promise.race([sendPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
