/**
 * @file Класи помилок відправки: помилка Telegram з кодом і таймаут.
 * @module errors
 *
 * Головний (хто використовує):
 * @see {@link ./run.ts}
 * @see {@link ./mocks.ts}
 */

// Помилка відправки з кодом Telegram (429, 403 тощо)
export class TelegramError extends Error {
  code: number;

  constructor(code: number) {
    super('Telegram error ' + code);
    this.code = code;
  }
}

// Telegram не відповів вчасно
export class SendTimeoutError extends Error {
  constructor() {
    super('Telegram не відповів вчасно');
  }
}
