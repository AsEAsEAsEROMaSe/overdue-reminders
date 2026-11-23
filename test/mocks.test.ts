/**
 * @file Тести підроблених портів: кожен метод і кожне поле, незалежність від масивів ззовні.
 * @module mocks.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/mocks.ts}
 * @see {@link ../src/errors.ts}
 * @see {@link ./builders.ts}
 */

import { describe, it, expect } from 'vitest';
import { FakeTaskRepo, FakeUserRepo, FakeMessenger, FakeSentLog, FakeAttemptLog, FakeLock } from '../src/mocks.ts';
import { TelegramError } from '../src/errors.ts';
import { makeTask, makeDoneTask, makeTaskInProgress, makeUser } from './builders.ts';

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

describe('FakeTaskRepo: listNotDone', () => {
  it('віддає open і in_progress, не віддає done', async () => {
    const open = makeTask('t1', 'u1', 'Відкрита', '2026-03-01T10:00:00Z');
    const inProgress = makeTaskInProgress('t2', 'u1', 'В роботі', '2026-03-01T10:00:00Z');
    const done = makeDoneTask('t3', 'u1', 'Зроблена', '2026-03-01T10:00:00Z');
    const repo = new FakeTaskRepo([open, done, inProgress]);

    const result = await repo.listNotDone();

    expect(result).toEqual([open, inProgress]);
  });
});

describe('FakeUserRepo: get', () => {
  it('знаходить потрібного серед кількох', async () => {
    const repo = new FakeUserRepo([makeUser('anna'), makeUser('bohdan')]);

    const found = await repo.get('bohdan');

    expect(found).toEqual(makeUser('bohdan'));
  });

  it('невідомий id дає undefined', async () => {
    const repo = new FakeUserRepo([makeUser('anna')]);

    const found = await repo.get('nobody');

    expect(found).toBe(undefined);
  });
});

describe('FakeMessenger', () => {
  it('успішна відправка записується і в sent, і в attempts', async () => {
    const messenger = new FakeMessenger();

    await messenger.send('chat-1', 'Привіт');

    expect(messenger.sent).toEqual([{ chatId: 'chat-1', text: 'Привіт' }]);
    expect(messenger.attempts).toEqual(['chat-1']);
  });

  it('rate_limited кидає TelegramError 429, у sent нічого', async () => {
    const messenger = new FakeMessenger();
    messenger.failFor('chat-1', 'rate_limited');

    await expect(messenger.send('chat-1', 'Привіт')).rejects.toEqual(new TelegramError(429));

    expect(messenger.sent).toEqual([]);
    expect(messenger.attempts).toEqual(['chat-1']);
  });

  it('blocked кидає TelegramError 403', async () => {
    const messenger = new FakeMessenger();
    messenger.failFor('chat-1', 'blocked');

    let caught: unknown = undefined;
    try {
      await messenger.send('chat-1', 'Привіт');
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof TelegramError).toBe(true);
    if (caught instanceof TelegramError) {
      expect(caught.code).toBe(403);
    }
  });

  it('збій для одного chatId не зачіпає інший', async () => {
    const messenger = new FakeMessenger();
    messenger.failFor('chat-1', 'blocked');

    await messenger.send('chat-2', 'Привіт');

    expect(messenger.sent).toEqual([{ chatId: 'chat-2', text: 'Привіт' }]);
  });

  it('clearFailure прибирає збій лише для свого chatId', async () => {
    const messenger = new FakeMessenger();
    messenger.failFor('chat-1', 'blocked');
    messenger.failFor('chat-2', 'blocked');

    messenger.clearFailure('chat-1');
    await messenger.send('chat-1', 'Привіт');

    await expect(messenger.send('chat-2', 'Привіт')).rejects.toEqual(new TelegramError(403));
    expect(messenger.sent).toEqual([{ chatId: 'chat-1', text: 'Привіт' }]);
  });
});

describe('FakeMessenger: clearFailure для чужого chatId', () => {
  it('прибирання збою іншого chatId не знімає наявний збій', async () => {
    const messenger = new FakeMessenger();
    messenger.failFor('chat-1', 'rate_limited');

    messenger.clearFailure('chat-2');

    await expect(messenger.send('chat-1', 'Привіт')).rejects.toEqual(new TelegramError(429));
  });
});

describe('FakeSentLog', () => {
  it('has хибне, поки не було mark', async () => {
    const log = new FakeSentLog();

    expect(await log.has('anna', '2026-03-10')).toBe(false);
  });

  it('mark працює окремо для кожного дня і кожного користувача', async () => {
    const log = new FakeSentLog();

    await log.mark('anna', '2026-03-10');

    expect(await log.has('anna', '2026-03-10')).toBe(true);
    expect(await log.has('anna', '2026-03-11')).toBe(false);
    expect(await log.has('bohdan', '2026-03-10')).toBe(false);
  });
});

describe('FakeAttemptLog', () => {
  it('count спершу 0, після двох add дорівнює 2', async () => {
    const log = new FakeAttemptLog();
    const before = await log.count('anna', '2026-03-10');

    await log.add('anna', '2026-03-10');
    await log.add('anna', '2026-03-10');

    expect(before).toBe(0);
    expect(await log.count('anna', '2026-03-10')).toBe(2);
  });

  it('count окремий для кожного користувача і кожного дня', async () => {
    const log = new FakeAttemptLog();

    await log.add('anna', '2026-03-10');
    await log.add('anna', '2026-03-10');
    await log.add('bohdan', '2026-03-10');
    await log.add('anna', '2026-03-11');

    expect(await log.count('anna', '2026-03-10')).toBe(2);
    expect(await log.count('bohdan', '2026-03-10')).toBe(1);
    expect(await log.count('anna', '2026-03-11')).toBe(1);
  });

  it('stop діє лише на свого користувача і свій день', async () => {
    const log = new FakeAttemptLog();

    await log.stop('anna', '2026-03-10', 'blocked');

    expect(await log.getStopReason('anna', '2026-03-10')).toBe('blocked');
    expect(await log.getStopReason('anna', '2026-03-11')).toBe(undefined);
    expect(await log.getStopReason('bohdan', '2026-03-10')).toBe(undefined);
  });

  it('getStopReason повертає саме ту причину, з якою зупинили', async () => {
    const log = new FakeAttemptLog();

    await log.stop('anna', '2026-03-10', 'blocked');
    await log.stop('bohdan', '2026-03-10', 'attempts_exhausted');

    expect(await log.getStopReason('anna', '2026-03-10')).toBe('blocked');
    expect(await log.getStopReason('bohdan', '2026-03-10')).toBe('attempts_exhausted');
  });

  it('stop не змінює лічильник спроб', async () => {
    const log = new FakeAttemptLog();
    await log.add('anna', '2026-03-10');

    await log.stop('anna', '2026-03-10', 'blocked');

    expect(await log.count('anna', '2026-03-10')).toBe(1);
  });
});

describe('FakeLock', () => {
  it('вільний ключ береться, зайнятий ні', async () => {
    const lock = new FakeLock();

    const first = await lock.acquire('k');
    const second = await lock.acquire('k');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('після release ключ знову можна взяти', async () => {
    const lock = new FakeLock();
    await lock.acquire('k');

    await lock.release('k');

    expect(await lock.acquire('k')).toBe(true);
  });

  it('release звільняє лише свій ключ', async () => {
    const lock = new FakeLock();
    await lock.acquire('a');
    await lock.acquire('b');

    await lock.release('a');

    expect(await lock.acquire('a')).toBe(true);
    expect(await lock.acquire('b')).toBe(false);
  });

  it('різні ключі не заважають один одному', async () => {
    const lock = new FakeLock();
    await lock.acquire('a');

    expect(await lock.acquire('b')).toBe(true);
  });
});
