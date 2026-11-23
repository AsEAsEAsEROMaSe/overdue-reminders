/**
 * @file Реалізації портів у пам'яті для тестів; підроблений месенджер вміє падати.
 * @module mocks
 *
 * Головний (хто використовує):
 * @see {@link ../test/faulty.ts}
 * @see {@link ../test/run.test.ts}
 * @see {@link ../test/mocks.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./ports.ts}
 * @see {@link ./types.ts}
 * @see {@link ./mocks.types.ts}
 * @see {@link ./errors.ts}
 */

import type { TaskRepo, UserRepo, Messenger, SentLog, AttemptLog, Lock } from './ports.ts';
import type { Task, User } from './types.ts';
import type { FailureKind, SentMessage, Failure, StopRecord } from './mocks.types.ts';
import { TelegramError } from './errors.ts';

// Ключ запису для журналів: користувач і день разом
function makeKey(userId: string, day: string): string {
  return userId + '|' + day;
}

export class FakeTaskRepo implements TaskRepo {
  tasks: Task[];

  // Беремо копію: зміна масиву ззовні не зачепить сховище
  constructor(tasks: readonly Task[]) {
    this.tasks = tasks.slice();
  }

  async listNotDone(): Promise<Task[]> {
    const result: Task[] = [];
    for (const task of this.tasks) {
      if (task.status !== 'done') {
        result.push(task);
      }
    }
    return result;
  }
}

export class FakeUserRepo implements UserRepo {
  users: User[];

  // Беремо копію: зміна масиву ззовні не зачепить сховище
  constructor(users: readonly User[]) {
    this.users = users.slice();
  }

  async get(id: string): Promise<User | undefined> {
    for (const user of this.users) {
      if (user.id === id) {
        return user;
      }
    }
    return undefined;
  }
}

export class FakeMessenger implements Messenger {
  // Успішно доставлені повідомлення
  sent: SentMessage[] = [];
  // Усі спроби відправки, і вдалі, і ні (chatId)
  attempts: string[] = [];
  // Для яких chatId відправка має впасти
  failures: Failure[] = [];

  failFor(chatId: string, kind: FailureKind): void {
    this.failures.push({ chatId: chatId, kind: kind });
  }

  clearFailure(chatId: string): void {
    const left: Failure[] = [];
    for (const failure of this.failures) {
      if (failure.chatId !== chatId) {
        left.push(failure);
      }
    }
    this.failures = left;
  }

  async send(chatId: string, text: string): Promise<void> {
    this.attempts.push(chatId);

    for (const failure of this.failures) {
      if (failure.chatId !== chatId) {
        continue;
      }
      if (failure.kind === 'rate_limited') {
        throw new TelegramError(429);
      }
      if (failure.kind === 'blocked') {
        throw new TelegramError(403);
      }
      if (failure.kind === 'hang') {
        // Відповідь ніколи не приходить: так перевіряємо таймаут
        await new Promise<void>(function () {});
      }
    }

    this.sent.push({ chatId: chatId, text: text });
  }
}

export class FakeSentLog implements SentLog {
  // Ключі «користувач|день», кому вже надіслано
  marks: string[] = [];

  async has(userId: string, day: string): Promise<boolean> {
    return this.marks.includes(makeKey(userId, day));
  }

  async mark(userId: string, day: string): Promise<void> {
    this.marks.push(makeKey(userId, day));
  }
}

export class FakeAttemptLog implements AttemptLog {
  // Один запис «користувач|день» на кожну спробу
  attempts: string[] = [];
  // Ключі «користувач|день», кому сьогодні більше не пробуємо
  stopped: StopRecord[] = [];

  async count(userId: string, day: string): Promise<number> {
    const key = makeKey(userId, day);
    let total = 0;
    for (const attempt of this.attempts) {
      if (attempt === key) {
        total = total + 1;
      }
    }
    return total;
  }

  async add(userId: string, day: string): Promise<void> {
    this.attempts.push(makeKey(userId, day));
  }

  async stop(userId: string, day: string, reason: string): Promise<void> {
    this.stopped.push({ key: makeKey(userId, day), reason: reason });
  }

  async getStopReason(userId: string, day: string): Promise<string | undefined> {
    const key = makeKey(userId, day);
    for (const record of this.stopped) {
      if (record.key === key) {
        return record.reason;
      }
    }
    return undefined;
  }
}

export class FakeLock implements Lock {
  // Зайняті ключі
  taken: string[] = [];

  async acquire(key: string): Promise<boolean> {
    if (this.taken.includes(key)) {
      return false;
    }
    this.taken.push(key);
    return true;
  }

  async release(key: string): Promise<void> {
    const left: string[] = [];
    for (const takenKey of this.taken) {
      if (takenKey !== key) {
        left.push(takenKey);
      }
    }
    this.taken = left;
  }
}
