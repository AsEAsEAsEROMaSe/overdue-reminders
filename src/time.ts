/**
 * @file Чисті функції часу за Києвом (Europe/Kyiv) через Intl.
 * @module time
 *
 * Головний (хто використовує):
 * @see {@link ./overdue.ts}
 * @see {@link ./format.ts}
 * @see {@link ./run.ts}
 * @see {@link ../test/time.test.ts}
 *
 * Нижчі (кого використовує):
 * @see {@link ./time.types.ts}
 */

import type { KyivParts } from './time.types.ts';

const REMINDER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

// Перетворює момент часу на дату і час за київським годинником.
// hourCycle h23 дає години 00..23, ніколи не 24
const kyivFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Розкладає момент часу на рік, місяць, день, години, хвилини за Києвом
function getKyivParts(date: Date): KyivParts {
  const result: KyivParts = { year: '', month: '', day: '', hour: '', minute: '' };
  const parts = kyivFormatter.formatToParts(date);
  for (const part of parts) {
    if (part.type === 'year') {
      result.year = part.value;
    }
    if (part.type === 'month') {
      result.month = part.value;
    }
    if (part.type === 'day') {
      result.day = part.value;
    }
    if (part.type === 'hour') {
      result.hour = part.value;
    }
    if (part.type === 'minute') {
      result.minute = part.value;
    }
  }
  return result;
}

// Київська доба у форматі YYYY-MM-DD
export function kyivDay(date: Date): string {
  const parts = getKyivParts(date);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

// Чи показує київський годинник 00 годин.
// Хвилини не перевіряємо: Київ зсунутий від UTC лише на цілі години
function isKyivMidnight(date: Date): boolean {
  const parts = getKyivParts(date);
  if (parts.hour === '00') {
    return true;
  }
  return false;
}

// Момент 00:00 за Києвом тієї доби, у якій лежить date.
// Київ завжди на 2 (зима) або 3 (літо) години попереду UTC,
// тож пробуємо обидва варіанти і беремо той, де за Києвом рівно 00:00
export function startOfKyivDay(date: Date): Date {
  const parts = getKyivParts(date);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Північ цієї дати за UTC; місяці в Date.UTC рахуються з нуля
  const midnightUtc = Date.UTC(year, month - 1, day);

  // Зимовий час: Київ на 2 години попереду UTC
  const winterStart = new Date(midnightUtc - 2 * HOUR_MS);
  if (isKyivMidnight(winterStart)) {
    return winterStart;
  }

  // Літній час: Київ на 3 години попереду UTC
  const summerStart = new Date(midnightUtc - 3 * HOUR_MS);
  if (isKyivMidnight(summerStart)) {
    return summerStart;
  }

  throw new Error('Не вдалося знайти початок доби за Києвом');
}

// Чи зараз година нагадування (10:00..10:59 за Києвом)
export function isReminderTime(now: Date): boolean {
  const parts = getKyivParts(now);
  if (Number(parts.hour) === REMINDER_HOUR) {
    return true;
  }
  return false;
}

// Дата і час за Києвом: ДД.ММ.РРРР ГГ:ХХ
export function formatKyivDate(date: Date): string {
  const parts = getKyivParts(date);
  return parts.day + '.' + parts.month + '.' + parts.year + ' ' + parts.hour + ':' + parts.minute;
}
