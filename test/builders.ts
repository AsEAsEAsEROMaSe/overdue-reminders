/**
 * @file Будівники тестових даних: задачі й користувачі, зокрема «старі» записи без полів.
 * @module builders
 *
 * Головний (хто використовує):
 * @see {@link ./overdue.test.ts}
 * @see {@link ./format.test.ts}
 * @see {@link ./run.test.ts}
 * @see {@link ./mocks.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/types.ts}
 */

import type { Task, TaskStatus, User } from '../src/types.ts';

// Задача з усіма полями; дедлайн у форматі ISO (UTC)
function buildTask(id: string, assigneeId: string, title: string, deadlineIso: string, status: TaskStatus): Task {
  const task: Task = {
    id: id,
    assigneeId: assigneeId,
    title: title,
    deadline: new Date(deadlineIso),
    status: status,
  };
  return task;
}

// Відкрита задача
export function makeTask(id: string, assigneeId: string, title: string, deadlineIso: string): Task {
  return buildTask(id, assigneeId, title, deadlineIso, 'open');
}

export function makeTaskInProgress(id: string, assigneeId: string, title: string, deadlineIso: string): Task {
  return buildTask(id, assigneeId, title, deadlineIso, 'in_progress');
}

export function makeDoneTask(id: string, assigneeId: string, title: string, deadlineIso: string): Task {
  return buildTask(id, assigneeId, title, deadlineIso, 'done');
}

// Старий запис з бази без поля deadline. Типи такого не дозволяють,
// тому обходимо їх навмисно: саме так дані приходять з бази
export function makeTaskWithoutDeadline(id: string, assigneeId: string): Task {
  const oldRecord = { id: id, assigneeId: assigneeId, title: 'Старий запис', status: 'open' };
  return oldRecord as unknown as Task;
}

// Старий виконаний запис з бази без поля deadline
export function makeDoneTaskWithoutDeadline(id: string, assigneeId: string): Task {
  const oldRecord = { id: id, assigneeId: assigneeId, title: 'Старий запис', status: 'done' };
  return oldRecord as unknown as Task;
}

// Старий запис з бази без поля assigneeId
export function makeTaskWithoutAssignee(id: string, deadlineIso: string): Task {
  const oldRecord = { id: id, title: 'Нічия задача', deadline: new Date(deadlineIso), status: 'open' };
  return oldRecord as unknown as Task;
}

// Запис з бази, де deadline = null
export function makeTaskWithNullDeadline(id: string, assigneeId: string): Task {
  const oldRecord = { id: id, assigneeId: assigneeId, title: 'Дедлайн null', deadline: null, status: 'open' };
  return oldRecord as unknown as Task;
}

// Запис з бази, де deadline рядком, а не Date
export function makeTaskWithStringDeadline(id: string, assigneeId: string, deadlineIso: string): Task {
  const oldRecord = { id: id, assigneeId: assigneeId, title: 'Дедлайн рядком', deadline: deadlineIso, status: 'open' };
  return oldRecord as unknown as Task;
}

// Запис з бази, де assigneeId = null
export function makeTaskWithNullAssignee(id: string, deadlineIso: string): Task {
  const oldRecord = { id: id, assigneeId: null, title: 'Виконавець null', deadline: new Date(deadlineIso), status: 'open' };
  return oldRecord as unknown as Task;
}

// Запис з бази без дедлайну і без виконавця
export function makeTaskWithoutDeadlineAndAssignee(id: string): Task {
  const oldRecord = { id: id, title: 'Зовсім порожня', status: 'open' };
  return oldRecord as unknown as Task;
}

// Виконаний запис з бази без виконавця
export function makeDoneTaskWithoutAssignee(id: string, deadlineIso: string): Task {
  const oldRecord = { id: id, title: 'Нічия зроблена', deadline: new Date(deadlineIso), status: 'done' };
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
