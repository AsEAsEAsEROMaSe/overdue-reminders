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
 * @see {@link ./run.types.ts}
 * @see {@link ./errors.ts}
 */

import type { Messenger } from './ports.ts';
import type { RunReport, UserTasks } from './types.ts';
import type { RunDeps, UserResult } from './run.types.ts';
import { TelegramError, SendTimeoutError } from './errors.ts';
import { kyivDay } from './time.ts';
import { groupOverdueByUser } from './overdue.ts';
import { buildReminderText } from './format.ts';

const MAX_ATTEMPTS = 3;

// Один запуск; якщо інший запуск того ж дня вже йде, нічого не робить
export async function runDailyReminders(now: Date, deps: RunDeps): Promise<RunReport> {
  const report: RunReport = { sent: [], skipped: [], failed: [] };
  const day = kyivDay(now);
  const lockKey = 'daily-reminders:' + day;

  const acquired = await deps.lock.acquire(lockKey);
  if (!acquired) {
    return report;
  }

  try {
    const tasks = await deps.taskRepo.listNotDone();
    const overdue = groupOverdueByUser(tasks, now);
    for (const item of overdue.skipped) {
      report.skipped.push(item);
    }

    for (const group of overdue.groups) {
      const userId = group.userId;

      let result: UserResult;
      try {
        result = await remindUser(group, day, deps);
      } catch (error) {
        // Збій сховища для одного користувача не зупиняє решту
        result = { status: 'failed', reason: 'error', final: false };
      }

      if (result.status === 'sent') {
        report.sent.push(userId);
      }
      if (result.status === 'skipped') {
        report.skipped.push({ kind: 'user', id: userId, reason: result.reason });
      }
      if (result.status === 'failed') {
        report.failed.push({ userId: userId, reason: result.reason, final: result.final });
      }
    }
  } finally {
    await deps.lock.release(lockKey);
  }

  return report;
}

// Шле одному виконавцю повідомлення з його задачами
async function remindUser(group: UserTasks, day: string, deps: RunDeps): Promise<UserResult> {
  const userId = group.userId;

  const user = await deps.userRepo.get(userId);
  if (user === undefined) {
    return { status: 'skipped', reason: 'user_not_found', final: false };
  }
  if (!user.telegramChatId) {
    return { status: 'skipped', reason: 'no_chat_id', final: false };
  }

  const alreadySent = await deps.sentLog.has(userId, day);
  if (alreadySent) {
    return { status: 'already_sent', reason: '', final: false };
  }

  // Сьогодні вже вирішили не пробувати: у звіт та сама причина, що й тоді
  const stopReason = await deps.attemptLog.getStopReason(userId, day);
  if (stopReason !== undefined) {
    return { status: 'failed', reason: stopReason, final: true };
  }
  await deps.attemptLog.add(userId, day);
  const attempts = await deps.attemptLog.count(userId, day);

  const text = buildReminderText(group.tasks);
  try {
    await sendWithTimeout(deps.messenger, user.telegramChatId, text, deps.sendTimeoutMs);
  } catch (error) {
    // mark не ставимо: наступний запуск того дня повторить
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
      let reasonToSave = 'attempts_exhausted';
      if (reason === 'blocked') {
        reasonToSave = 'blocked';
      }
      await deps.attemptLog.stop(userId, day, reasonToSave);
    }

    return { status: 'failed', reason: reason, final: final };
  }

  await deps.sentLog.mark(userId, day);
  return { status: 'sent', reason: '', final: false };
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

// Шле повідомлення; якщо відповіді немає за timeoutMs, кидає SendTimeoutError.
// Хто перший: відповідь Telegram чи таймер, той і вирішує результат
function sendWithTimeout(messenger: Messenger, chatId: string, text: string, timeoutMs: number): Promise<void> {
  return new Promise<void>(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new SendTimeoutError());
    }, timeoutMs);

    // Telegram відповів успіхом: таймер більше не потрібен
    function onSent(): void {
      clearTimeout(timer);
      resolve();
    }

    // Telegram відповів помилкою: таймер теж прибираємо
    function onError(error: unknown): void {
      clearTimeout(timer);
      reject(error);
    }

    // send може впасти одразу, ще не повернувши Promise: таймер теж прибираємо
    let sending: Promise<void>;
    try {
      sending = messenger.send(chatId, text);
    } catch (error) {
      onError(error);
      return;
    }
    sending.then(onSent, onError);
  });
}
