/**
 * @file Інтерфейси зовнішніх залежностей: сховища, месенджер, журнали, блокування.
 * @module ports
 *
 * Головний (хто використовує):
 * @see {@link ../test/run.test.ts}
 * @see {@link ../test/faulty.ts}
 * @see {@link ./run.ts}
 * @see {@link ./run.types.ts}
 * @see {@link ./mocks.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./types.ts}
 */

import type { Task, User } from './types.ts';

export interface TaskRepo {
  listNotDone(): Promise<Task[]>;
}

export interface UserRepo {
  // undefined, якщо користувача немає
  get(id: string): Promise<User | undefined>;
}

export interface Messenger {
  // Кидає TelegramError, якщо Telegram відповів помилкою
  send(chatId: string, text: string): Promise<void>;
}

// day у форматі YYYY-MM-DD за Києвом
export interface SentLog {
  has(userId: string, day: string): Promise<boolean>;
  mark(userId: string, day: string): Promise<void>;
}

// Спроби відправки користувачу за день
export interface AttemptLog {
  // Скільки спроб уже було
  count(userId: string, day: string): Promise<number>;
  // Додати одну спробу
  add(userId: string, day: string): Promise<void>;
  // Більше сьогодні не пробувати (403 або вичерпано спроби)
  stop(userId: string, day: string): Promise<void>;
  isStopped(userId: string, day: string): Promise<boolean>;
}

export interface Lock {
  // true, якщо взяли; false, якщо вже зайнято
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}
