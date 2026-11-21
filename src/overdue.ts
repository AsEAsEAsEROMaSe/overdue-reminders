/**
 * @file Вибирає прострочені задачі і групує їх за виконавцем.
 * @module overdue
 *
 * Головний (хто використовує):
 * @see {@link ./run.ts}
 * @see {@link ../test/overdue.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./time.ts}
 * @see {@link ./types.ts}
 * @see {@link ./overdue.types.ts}
 */

import { startOfKyivDay } from './time.ts';
import type { Task, UserTasks, SkippedItem } from './types.ts';
import type { OverdueResult } from './overdue.types.ts';

// Чи є в задачі справжня дата дедлайну (старі записи можуть її не мати)
function hasValidDeadline(task: Task): boolean {
  const isDate = task.deadline instanceof Date;
  if (isDate === false) {
    return false;
  }
  if (Number.isNaN(task.deadline.getTime())) {
    return false;
  }
  return true;
}

// Шукає групу виконавця; undefined, якщо такої ще немає
function findGroup(groups: UserTasks[], userId: string): UserTasks | undefined {
  for (const group of groups) {
    if (group.userId === userId) {
      return group;
    }
  }
  return undefined;
}

// Прострочена: дедлайн раніше за початок поточної доби за Києвом і статус не done
export function groupOverdueByUser(tasks: Task[], now: Date): OverdueResult {
  const dayStart = startOfKyivDay(now);
  const groups: UserTasks[] = [];
  const skipped: SkippedItem[] = [];

  for (const task of tasks) {
    if (task.status === 'done') {
      continue;
    }
    if (!hasValidDeadline(task)) {
      skipped.push({ kind: 'task', id: task.id, reason: 'no_deadline' });
      continue;
    }
    if (!task.assigneeId) {
      skipped.push({ kind: 'task', id: task.id, reason: 'no_assignee' });
      continue;
    }
    if (task.deadline.getTime() >= dayStart.getTime()) {
      continue;
    }

    let group = findGroup(groups, task.assigneeId);
    if (group === undefined) {
      group = { userId: task.assigneeId, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(task);
  }

  return { groups: groups, skipped: skipped };
}
