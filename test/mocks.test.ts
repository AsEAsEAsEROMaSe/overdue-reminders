/**
 * @file Тести підроблених сховищ: вони не залежать від масивів, переданих у конструктор.
 * @module mocks.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/mocks.ts}
 * @see {@link ./builders.ts}
 */

import { describe, it, expect } from 'vitest';
import { FakeTaskRepo, FakeUserRepo } from '../src/mocks.ts';
import { makeTask, makeUser } from './builders.ts';

describe('FakeTaskRepo', () => {
  it('зміна масиву після створення сховища не зачіпає сховище', async () => {
    const first = makeTask('t1', 'u1', 'Перша', '2026-03-01T10:00:00Z');
    const tasks = [first];
    const repo = new FakeTaskRepo(tasks);

    tasks.push(makeTask('t2', 'u1', 'Друга', '2026-03-02T10:00:00Z'));
    const result = await repo.listNotDone();

    expect(result).toEqual([first]);
  });

  it('зміна результату listNotDone не зачіпає сховище', async () => {
    const first = makeTask('t1', 'u1', 'Перша', '2026-03-01T10:00:00Z');
    const repo = new FakeTaskRepo([first]);

    const firstResult = await repo.listNotDone();
    firstResult.push(makeTask('t2', 'u1', 'Друга', '2026-03-02T10:00:00Z'));
    const secondResult = await repo.listNotDone();

    expect(secondResult).toEqual([first]);
  });

  it('очищення масиву після створення сховища не спустошує сховище', async () => {
    const first = makeTask('t1', 'u1', 'Перша', '2026-03-01T10:00:00Z');
    const tasks = [first];
    const repo = new FakeTaskRepo(tasks);

    tasks.pop();
    const result = await repo.listNotDone();

    expect(result).toEqual([first]);
  });
});

describe('FakeUserRepo', () => {
  it('зміна масиву після створення сховища не зачіпає сховище', async () => {
    const users = [makeUser('anna')];
    const repo = new FakeUserRepo(users);

    users.push(makeUser('bohdan'));
    const found = await repo.get('bohdan');

    expect(found).toBe(undefined);
  });

  it('очищення масиву після створення сховища не губить користувача', async () => {
    const anna = makeUser('anna');
    const users = [anna];
    const repo = new FakeUserRepo(users);

    users.pop();
    const found = await repo.get('anna');

    expect(found).toEqual(anna);
  });
});
