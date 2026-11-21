/**
 * @file Типи для вибору прострочених задач.
 * @module overdue.types
 *
 * Головний (хто використовує):
 * @see {@link ./overdue.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./types.ts}
 */

import type { UserTasks, SkippedItem } from './types.ts';

// Результат вибору: групи за виконавцем і пропущені погані задачі
export interface OverdueResult {
  groups: UserTasks[];
  skipped: SkippedItem[];
}
