/**
 * @file Типи даних: задача, користувач, звіт запуску.
 * @module types
 *
 * Головний (хто використовує):
 * @see {@link ../test/faulty.ts}
 * @see {@link ./ports.ts}
 * @see {@link ./overdue.ts}
 * @see {@link ./overdue.types.ts}
 * @see {@link ./format.ts}
 * @see {@link ./run.ts}
 * @see {@link ./mocks.ts}
 * @see {@link ../test/builders.ts}
 * @see {@link ../test/run.test.ts}
 */

export type TaskStatus = 'open' | 'in_progress' | 'done';

// readonly: дані приходять зі сховища, код їх лише читає.
// Спробу змінити поле tsc зловить ще до запуску
export interface Task {
  readonly id: string;
  readonly assigneeId: string;
  readonly title: string;
  readonly deadline: Date;
  readonly status: TaskStatus;
}

export interface User {
  readonly id: string;
  readonly telegramChatId: string;
}

// Задачі одного виконавця.
// Масив tasks звичайний: overdue.ts додає в нього задачі, поки збирає групу
export interface UserTasks {
  readonly userId: string;
  tasks: Task[];
}

// Пропущений запис: погана задача або поганий користувач
export interface SkippedItem {
  readonly kind: 'task' | 'user';
  readonly id: string;
  readonly reason: string;
}

// Невдала відправка; final = true означає, що сьогодні більше не пробуємо
export interface FailedItem {
  readonly userId: string;
  readonly reason: string;
  readonly final: boolean;
}

// Звіт звичайний: запуск заповнює його по ходу
export interface RunReport {
  sent: string[];
  skipped: SkippedItem[];
  failed: FailedItem[];
}
