/**
 * @file Будівники тестових даних: задачі й користувачі, зокрема «старі» записи без полів.
 * @module builders
 *
 * Головний (хто використовує):
 * @see {@link ./overdue.test.ts}
 * @see {@link ./format.test.ts}
 * @see {@link ./run.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/types.ts}
 */

import type { Task, User } from '../src/types.ts';

// Відкрита задача з дедлайном у форматі ISO (UTC)
export function makeTask(id: string, assigneeId: string, title: string, deadlineIso: string): Task {
  const task: Task = {
    id: id,
    assigneeId: assigneeId,
    title: title,
    deadline: new Date(deadlineIso),
    status: 'open',
  };
  return task;
}

export function makeTaskInProgress(id: string, assigneeId: string, title: string, deadlineIso: string): Task {
  const task = makeTask(id, assigneeId, title, deadlineIso);
  task.status = 'in_progress';
  return task;
}

export function makeDoneTask(id: string, assigneeId: string, title: string, deadlineIso: string): Task {
  const task = makeTask(id, assigneeId, title, deadlineIso);
  task.status = 'done';
  return task;
}

// Старий запис з бази без поля deadline. Типи такого не дозволяють,
// тому обходимо їх навмисно: саме так дані приходять з бази
export function makeTaskWithoutDeadline(id: string, assigneeId: string): Task {
  const oldRecord = { id: id, assigneeId: assigneeId, title: 'Старий запис', status: 'open' };
  return oldRecord as unknown as Task;
}

// Старий запис з бази без поля assigneeId
export function makeTaskWithoutAssignee(id: string, deadlineIso: string): Task {
  const oldRecord = { id: id, title: 'Нічия задача', deadline: new Date(deadlineIso), status: 'open' };
  return oldRecord as unknown as Task;
}

// Вигадані chat_id для тестів, не справжні
export function makeUser(id: string): User {
  const user: User = { id: id, telegramChatId: 'chat-' + id };
  return user;
}

// Старий запис користувача без поля telegramChatId
export function makeUserWithoutChatId(id: string): User {
  const oldRecord = { id: id };
  return oldRecord as unknown as User;
}

// Заморожує задачі і сам масив: будь-яка спроба змінити їх кине TypeError
export function freezeTasks(tasks: Task[]): Task[] {
  for (const task of tasks) {
    Object.freeze(task);
  }
  Object.freeze(tasks);
  return tasks;
}

// Заморожує користувачів і сам масив
export function freezeUsers(users: User[]): User[] {
  for (const user of users) {
    Object.freeze(user);
  }
  Object.freeze(users);
  return users;
}
