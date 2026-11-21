/**
 * @file Типи даних: задача, користувач, помилка Telegram, звіт запуску.
 * @module types
 *
 * Головний (хто використовує):
 * @see {@link ./ports.ts}
 * @see {@link ./overdue.ts}
 * @see {@link ./format.ts}
 * @see {@link ./run.ts}
 * @see {@link ./mocks.ts}
 * @see {@link ../test/builders.ts}
 * @see {@link ../test/run.test.ts}
 */

export type TaskStatus = 'open' | 'in_progress' | 'done';

export interface Task {
  id: string;
  assigneeId: string;
  title: string;
  deadline: Date;
  status: TaskStatus;
}

export interface User {
  id: string;
  telegramChatId: string;
}

// Помилка відправки з кодом Telegram (429, 403 тощо)
export class TelegramError extends Error {
  code: number;

  constructor(code: number) {
    super('Telegram error ' + code);
    this.code = code;
  }
}

// Задачі одного виконавця
export interface UserTasks {
  userId: string;
  tasks: Task[];
}

// Пропущений запис: погана задача або поганий користувач
export interface SkippedItem {
  kind: 'task' | 'user';
  id: string;
  reason: string;
}

// Невдала відправка; final = true означає, що сьогодні більше не пробуємо
export interface FailedItem {
  userId: string;
  reason: string;
  final: boolean;
}

export interface RunReport {
  sent: string[];
  skipped: SkippedItem[];
  failed: FailedItem[];
}
