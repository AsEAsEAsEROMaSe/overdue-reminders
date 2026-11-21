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
 */

import type { TaskRepo, UserRepo, Messenger, SentLog } from '../src/ports.ts';
import type { Task, User } from '../src/types.ts';
import { FakeTaskRepo, FakeUserRepo, FakeSentLog } from '../src/mocks.ts';

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
