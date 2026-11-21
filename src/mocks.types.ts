/**
 * @file Типи для підроблених портів у пам'яті.
 * @module mocks.types
 *
 * Головний (хто використовує):
 * @see {@link ./mocks.ts}
 */

// Як має впасти відправка на заданий chatId
export type FailureKind = 'rate_limited' | 'blocked' | 'hang';

// Успішно доставлене повідомлення
export interface SentMessage {
  chatId: string;
  text: string;
}

// Правило: для цього chatId відправка падає ось так
export interface Failure {
  chatId: string;
  kind: FailureKind;
}
