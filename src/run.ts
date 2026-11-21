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
import type { RunReport, UserTasks } from './types.ts';
import { kyivDay } from './time.ts';
import { groupOverdueByUser } from './overdue.ts';
import { buildReminderText } from './format.ts';

const MAX_ATTEMPTS = 3;

export interface RunDeps {
  taskRepo: TaskRepo;
  userRepo: UserRepo;
  messenger: Messenger;
  sentLog: SentLog;
  attemptLog: AttemptLog;
  lock: Lock;
  // Скільки чекати відповіді Telegram, мс (наприклад 10000)
  sendTimeoutMs: number;
}

// Telegram не відповів вчасно
class SendTimeoutError extends Error {}

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

// Вибирає прострочені задачі і по черзі обробляє кожного виконавця
async function sendReminders(now: Date, day: string, deps: RunDeps): Promise<RunReport> {
  const report: RunReport = { sent: [], skipped: [], failed: [] };

  const tasks = await deps.taskRepo.listNotDone();
  const overdue = groupOverdueByUser(tasks, now);
  for (const item of overdue.skipped) {
    report.skipped.push(item);
  }

  for (const group of overdue.groups) {
    try {
      await remindUser(group, day, deps, report);
    } catch (error) {
      // Збій сховища для одного користувача не зупиняє решту
      report.failed.push({ userId: group.userId, reason: 'error', final: false });
    }
  }

  return report;
}

// Шле одному виконавцю повідомлення з його задачами і записує результат у звіт
async function remindUser(group: UserTasks, day: string, deps: RunDeps, report: RunReport): Promise<void> {
  const userId = group.userId;

  const user = await deps.userRepo.get(userId);
  if (user === undefined) {
    report.skipped.push({ kind: 'user', id: userId, reason: 'user_not_found' });
    return;
  }
  if (!user.telegramChatId) {
    report.skipped.push({ kind: 'user', id: userId, reason: 'no_chat_id' });
    return;
  }

  const alreadySent = await deps.sentLog.has(userId, day);
  if (alreadySent) {
    return;
  }

  const stopped = await deps.attemptLog.isStopped(userId, day);
  if (stopped) {
    report.failed.push({ userId: userId, reason: 'attempts_exhausted', final: true });
    return;
  }
  await deps.attemptLog.add(userId, day);
  const attempts = await deps.attemptLog.count(userId, day);

  const text = buildReminderText(group.tasks);
  try {
    await sendWithTimeout(deps.messenger, user.telegramChatId, text, deps.sendTimeoutMs);
  } catch (error) {
    // mark не ставимо: наступний запуск того дня повторить
    await recordFailure(error, userId, attempts, day, deps, report);
    return;
  }

  await deps.sentLog.mark(userId, day);
  report.sent.push(userId);
}

// Записує невдалу відправку у звіт
async function recordFailure(
  error: unknown,
  userId: string,
  attempts: number,
  day: string,
  deps: RunDeps,
  report: RunReport,
): Promise<void> {
  const reason = getErrorReason(error);

  // 403 (бот заблокований) або остання спроба: сьогодні більше не пробуємо
  let final = false;
  if (reason === 'blocked') {
    final = true;
  }
  if (attempts >= MAX_ATTEMPTS) {
    final = true;
  }

  if (final) {
    await deps.attemptLog.stop(userId, day);
  }
  report.failed.push({ userId: userId, reason: reason, final: final });
}

// Причина збою для звіту
function getErrorReason(error: unknown): string {
  if (error instanceof SendTimeoutError) {
    return 'timeout';
  }
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

// Шле повідомлення; якщо відповіді немає за timeoutMs, кидає SendTimeoutError
async function sendWithTimeout(messenger: Messenger, chatId: string, text: string, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined = undefined;
  const timeout = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new SendTimeoutError());
    }, timeoutMs);
  });

  try {
    await Promise.race([messenger.send(chatId, text), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
