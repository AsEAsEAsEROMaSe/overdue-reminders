/**
 * @file Чисті функції часу за Києвом (Europe/Kyiv) через Intl.
 * @module time
 *
 * Головний (хто використовує):
 * @see {@link ./overdue.ts}
 * @see {@link ./format.ts}
 * @see {@link ./run.ts}
 * @see {@link ../test/time.test.ts}
 */

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

interface KyivParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

// Розкладає момент часу на рік, місяць, день, години, хвилини за Києвом
function getKyivParts(date: Date): KyivParts {
  const values: Record<string, string> = {};
  for (const part of kyivFormatter.formatToParts(date)) {
    values[part.type] = part.value;
  }
  const result: KyivParts = {
    year: values['year'],
    month: values['month'],
    day: values['day'],
    hour: values['hour'],
    minute: values['minute'],
  };
  return result;
}

// Київська доба у форматі YYYY-MM-DD
export function kyivDay(date: Date): string {
  const parts = getKyivParts(date);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

// Момент 00:00 за Києвом тієї доби, у якій лежить date.
// Київ завжди на 2 (зима) або 3 (літо) години попереду UTC,
// тож пробуємо обидва варіанти і беремо той, де за Києвом рівно 00:00
export function startOfKyivDay(date: Date): Date {
  const parts = getKyivParts(date);
  const midnightUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const offsets = [2, 3];
  for (const hours of offsets) {
    const candidate = new Date(midnightUtc - hours * HOUR_MS);
    const candidateParts = getKyivParts(candidate);
    if (candidateParts.hour === '00') {
      if (candidateParts.minute === '00') {
        return candidate;
      }
    }
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
