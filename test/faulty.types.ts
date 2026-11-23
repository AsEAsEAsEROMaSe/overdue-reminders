/**
 * @file Типи для сховищ зі збоями в тестах.
 * @module faulty.types
 *
 * Головний (хто використовує):
 * @see {@link ./faulty.ts}
 */

// Метод журналу спроб, який має впасти; друкарську помилку в назві зловить tsc
export type AttemptLogMethod = 'count' | 'add' | 'stop' | 'getStopReason';
