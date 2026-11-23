/**
 * @file Сховища й месенджери зі збоями для тестів: падають, тупо віддають дані або відповідають повільно.
 * @module faulty
 *
 * Головний (хто використовує):
 * @see {@link ./run.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/ports.ts}
 * @see {@link ../src/types.ts}
 * @see {@link ../src/mocks.ts}
 * @see {@link ../src/errors.ts}
 */

import type { TaskRepo, UserRepo, Messenger, SentLog, AttemptLog, Lock } from '../src/ports.ts';
import type { Task, User } from '../src/types.ts';
import { FakeTaskRepo, FakeUserRepo, FakeSentLog, FakeAttemptLog, FakeLock } from '../src/mocks.ts';
import { TelegramError } from '../src/errors.ts';

// Перший виклик падає, далі працює як звичайне сховище
export class TaskRepoFailingOnce implements TaskRepo {
  realRepo: FakeTaskRepo;
  failed = false;

  constructor(tasks: readonly Task[]) {
    this.realRepo = new FakeTaskRepo(tasks);
  }

  async listNotDone(): Promise<Task[]> {
    if (this.failed === false) {
      this.failed = true;
      throw new Error('база недоступна');
    }
    return this.realRepo.listNotDone();
  }
}

// Сховище з помилкою: віддає всі задачі, і виконані теж
export class TaskRepoWithDoneTasks implements TaskRepo {
  tasks: Task[];

  constructor(tasks: readonly Task[]) {
    this.tasks = tasks.slice();
  }

  async listNotDone(): Promise<Task[]> {
    return this.tasks.slice();
  }
}

// Для одного користувача сховище падає, для решти працює
export class UserRepoFailingFor implements UserRepo {
  realRepo: FakeUserRepo;
  failingUserId: string;

  constructor(users: readonly User[], failingUserId: string) {
    this.realRepo = new FakeUserRepo(users);
    this.failingUserId = failingUserId;
  }

  async get(id: string): Promise<User | undefined> {
    if (id === this.failingUserId) {
      throw new Error('база недоступна');
    }
    return this.realRepo.get(id);
  }
}

// mark падає для одного користувача, для решти працює
export class SentLogFailingMarkFor implements SentLog {
  realLog = new FakeSentLog();
  failingUserId: string;

  constructor(failingUserId: string) {
    this.failingUserId = failingUserId;
  }

  async has(userId: string, day: string): Promise<boolean> {
    return this.realLog.has(userId, day);
  }

  async mark(userId: string, day: string): Promise<void> {
    if (userId === this.failingUserId) {
      throw new Error('журнал недоступний');
    }
    await this.realLog.mark(userId, day);
  }
}

// Падає з помилкою, що не є помилкою Telegram
export class BrokenMessenger implements Messenger {
  async send(): Promise<void> {
    throw new Error('мережа впала');
  }
}

// Відповідає успіхом через delayMs мілісекунд
export class SlowMessenger implements Messenger {
  delayMs: number;

  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  async send(): Promise<void> {
    const delayMs = this.delayMs;
    await new Promise<void>(function (resolve) {
      setTimeout(resolve, delayMs);
    });
  }
}

// Рахує, скільки разів запуск читав задачі
export class CountingTaskRepo implements TaskRepo {
  realRepo: FakeTaskRepo;
  calls = 0;

  constructor(tasks: readonly Task[]) {
    this.realRepo = new FakeTaskRepo(tasks);
  }

  async listNotDone(): Promise<Task[]> {
    this.calls = this.calls + 1;
    return this.realRepo.listNotDone();
  }
}

// has падає для одного користувача, для решти працює
export class SentLogFailingHasFor implements SentLog {
  realLog = new FakeSentLog();
  failingUserId: string;

  constructor(failingUserId: string) {
    this.failingUserId = failingUserId;
  }

  async has(userId: string, day: string): Promise<boolean> {
    if (userId === this.failingUserId) {
      throw new Error('журнал недоступний');
    }
    return this.realLog.has(userId, day);
  }

  async mark(userId: string, day: string): Promise<void> {
    await this.realLog.mark(userId, day);
  }
}

// Один метод журналу спроб падає для одного користувача
export class AttemptLogFailingOn implements AttemptLog {
  realLog = new FakeAttemptLog();
  failingMethod: string;
  failingUserId: string;

  constructor(failingMethod: string, failingUserId: string) {
    this.failingMethod = failingMethod;
    this.failingUserId = failingUserId;
  }

  // Кидає помилку, якщо зараз викликали саме той метод для того користувача
  failIfNeeded(method: string, userId: string): void {
    if (method !== this.failingMethod) {
      return;
    }
    if (userId !== this.failingUserId) {
      return;
    }
    throw new Error('журнал спроб недоступний');
  }

  async count(userId: string, day: string): Promise<number> {
    this.failIfNeeded('count', userId);
    return this.realLog.count(userId, day);
  }

  async add(userId: string, day: string): Promise<void> {
    this.failIfNeeded('add', userId);
    await this.realLog.add(userId, day);
  }

  async stop(userId: string, day: string, reason: string): Promise<void> {
    this.failIfNeeded('stop', userId);
    await this.realLog.stop(userId, day, reason);
  }

  async getStopReason(userId: string, day: string): Promise<string | undefined> {
    this.failIfNeeded('getStopReason', userId);
    return this.realLog.getStopReason(userId, day);
  }
}

// Записує, які ключі брали і знімали
export class RecordingLock implements Lock {
  realLock = new FakeLock();
  acquired: string[] = [];
  released: string[] = [];

  async acquire(key: string): Promise<boolean> {
    this.acquired.push(key);
    return this.realLock.acquire(key);
  }

  async release(key: string): Promise<void> {
    this.released.push(key);
    await this.realLock.release(key);
  }
}

// acquire падає; release лише записує виклики
export class LockFailingOnAcquire implements Lock {
  released: string[] = [];

  async acquire(): Promise<boolean> {
    throw new Error('блокування недоступне');
  }

  async release(key: string): Promise<void> {
    this.released.push(key);
  }
}

// Telegram відповідає помилкою з заданим кодом
export class MessengerFailingWithCode implements Messenger {
  code: number;

  constructor(code: number) {
    this.code = code;
  }

  async send(): Promise<void> {
    throw new TelegramError(this.code);
  }
}

// Кидає рядок замість помилки (так буває в чужих бібліотеках)
export class MessengerThrowingString implements Messenger {
  async send(): Promise<void> {
    throw 'щось пішло не так';
  }
}

// Не async: кидає помилку одразу, ще до того, як поверне Promise
export class MessengerThrowingSync implements Messenger {
  code: number;

  constructor(code: number) {
    this.code = code;
  }

  send(): Promise<void> {
    throw new TelegramError(this.code);
  }
}
