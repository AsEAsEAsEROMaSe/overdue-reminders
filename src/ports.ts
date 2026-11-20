/**
 * @file Інтерфейси зовнішніх залежностей: сховища, месенджер, журнали, блокування.
 * @module ports
 *
 * Головний (хто використовує):
 * @see {@link ./run.ts}
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

// Скільки спроб відправки було в користувача за день
export interface AttemptLog {
  count(userId: string, day: string): Promise<number>;
  set(userId: string, day: string, count: number): Promise<void>;
}

export interface Lock {
  // true, якщо взяли; false, якщо вже зайнято
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}
