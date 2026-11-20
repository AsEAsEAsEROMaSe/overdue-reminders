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
import type { RunReport } from './types.ts';
import { kyivDay } from './time.ts';
import { groupOverdueByUser } from './overdue.ts';
import { buildReminderText } from './format.ts';

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
    const text = buildReminderText(group.tasks);
    await deps.messenger.send(user.telegramChatId, text);
    await deps.sentLog.mark(group.userId, day);
    report.sent.push(group.userId);
  }

  return report;
}
