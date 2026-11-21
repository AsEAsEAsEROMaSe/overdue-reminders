/**
 * @file Тести класів помилок відправки.
 * @module errors.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/errors.ts}
 */

import { describe, it, expect } from 'vitest';
import { TelegramError, SendTimeoutError } from '../src/errors.ts';

describe('TelegramError', () => {
  it('зберігає код Telegram', () => {
    const error = new TelegramError(429);

    expect(error.code).toBe(429);
  });

  it('код потрапляє в текст помилки', () => {
    const error = new TelegramError(403);

    expect(error.message).toBe('Telegram error 403');
  });

  it('це звичайна помилка: instanceof Error', () => {
    const error = new TelegramError(500);

    expect(error instanceof Error).toBe(true);
    expect(error instanceof TelegramError).toBe(true);
  });

  it('не плутається з таймаутом', () => {
    const error = new TelegramError(500);

    expect(error instanceof SendTimeoutError).toBe(false);
  });
});

describe('SendTimeoutError', () => {
  it('має зрозумілий текст', () => {
    const error = new SendTimeoutError();

    expect(error.message).toBe('Telegram не відповів вчасно');
  });

  it('це звичайна помилка і не TelegramError', () => {
    const error = new SendTimeoutError();

    expect(error instanceof Error).toBe(true);
    expect(error instanceof SendTimeoutError).toBe(true);
    expect(error instanceof TelegramError).toBe(false);
  });
});
