/**
 * @file Типи для часу за Києвом.
 * @module time.types
 *
 * Головний (хто використовує):
 * @see {@link ./time.ts}
 */

// Дата і час за київським годинником, кожна частина рядком з нулями попереду
export interface KyivParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}
