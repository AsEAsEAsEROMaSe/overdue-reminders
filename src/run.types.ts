/**
 * @file Типи для одного запуску нагадувань.
 * @module run.types
 *
 * Головний (хто використовує):
 * @see {@link ./run.ts}
 * @see {@link ../test/run.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./ports.ts}
 */

import type { TaskRepo, UserRepo, Messenger, SentLog, AttemptLog, Lock } from './ports.ts';

// Усе, що потрібно запуску ззовні; після створення не міняється
export interface RunDeps {
  readonly taskRepo: TaskRepo;
  readonly userRepo: UserRepo;
  readonly messenger: Messenger;
  readonly sentLog: SentLog;
  readonly attemptLog: AttemptLog;
  readonly lock: Lock;
  // Скільки чекати відповіді Telegram, мс (наприклад 10000)
  readonly sendTimeoutMs: number;
}

// Чим закінчилась обробка одного користувача.
// already_sent: сьогодні вже отримав, у звіт не пишемо
export interface UserResult {
  status: 'sent' | 'already_sent' | 'skipped' | 'failed';
  reason: string;
  final: boolean;
}
