/**
 * @file Реалізації портів у пам'яті для тестів; мок месенджера вміє падати.
 * @module mocks
 *
 * Головний (хто використовує):
 * @see {@link ../test/run.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./ports.ts}
 * @see {@link ./types.ts}
 */

import type { TaskRepo, UserRepo, Messenger, SentLog, AttemptLog, Lock } from './ports.ts';
import { TelegramError } from './types.ts';
import type { Task, User } from './types.ts';

export function createTaskRepo(tasks: Task[]): TaskRepo {
  return {
    async listNotDone() {
      const result: Task[] = [];
      for (const task of tasks) {
        if (task.status !== 'done') {
          result.push(task);
        }
      }
      return result;
    },
  };
}

export function createUserRepo(users: User[]): UserRepo {
  return {
    async get(id: string) {
      for (const user of users) {
        if (user.id === id) {
          return user;
        }
      }
      return undefined;
    },
  };
}

// Як має впасти відправка на заданий chatId
export type FailureKind = 'rate_limited' | 'blocked' | 'hang';

export interface SentMessage {
  chatId: string;
  text: string;
}

export interface MessengerMock extends Messenger {
  // Успішно доставлені повідомлення
  sent: SentMessage[];
  // Усі спроби відправки, і вдалі, і ні (chatId)
  attempts: string[];
  failFor(chatId: string, kind: FailureKind): void;
  clearFailure(chatId: string): void;
}

export function createMessenger(): MessengerMock {
  const failures = new Map<string, FailureKind>();
  const mock: MessengerMock = {
    sent: [],
    attempts: [],
    failFor(chatId: string, kind: FailureKind) {
      failures.set(chatId, kind);
    },
    clearFailure(chatId: string) {
      failures.delete(chatId);
    },
    async send(chatId: string, text: string) {
      mock.attempts.push(chatId);
      const kind = failures.get(chatId);
      if (kind === 'rate_limited') {
        throw new TelegramError(429);
      }
      if (kind === 'blocked') {
        throw new TelegramError(403);
      }
      if (kind === 'hang') {
        // Відповідь ніколи не приходить: перевіряє таймаут
        await new Promise<void>(() => {});
      }
      mock.sent.push({ chatId: chatId, text: text });
    },
  };
  return mock;
}

export function createSentLog(): SentLog {
  const marks = new Set<string>();
  return {
    async has(userId: string, day: string) {
      return marks.has(userId + '|' + day);
    },
    async mark(userId: string, day: string) {
      marks.add(userId + '|' + day);
    },
  };
}

export function createAttemptLog(): AttemptLog {
  const counts = new Map<string, number>();
  const stopped = new Set<string>();
  return {
    async count(userId: string, day: string) {
      const value = counts.get(userId + '|' + day);
      if (value === undefined) {
        return 0;
      }
      return value;
    },
    async add(userId: string, day: string) {
      const key = userId + '|' + day;
      let value = counts.get(key);
      if (value === undefined) {
        value = 0;
      }
      counts.set(key, value + 1);
    },
    async stop(userId: string, day: string) {
      stopped.add(userId + '|' + day);
    },
    async isStopped(userId: string, day: string) {
      return stopped.has(userId + '|' + day);
    },
  };
}

export function createLock(): Lock {
  const taken = new Set<string>();
  return {
    async acquire(key: string) {
      if (taken.has(key)) {
        return false;
      }
      taken.add(key);
      return true;
    },
    async release(key: string) {
      taken.delete(key);
    },
  };
}
