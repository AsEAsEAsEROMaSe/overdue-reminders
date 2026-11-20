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

const KYIV_TIME_ZONE = 'Europe/Kyiv';
const REMINDER_HOUR = 10;

// hourCycle h23 дає години 00..23, ніколи не 24
const kyivFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: KYIV_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface KyivParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

// Розкладає момент часу на частини за київським годинником
function getKyivParts(date: Date): KyivParts {
  const result: KyivParts = {
    year: '',
    month: '',
    day: '',
    hour: '',
    minute: '',
    second: '',
  };
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
    if (part.type === 'second') {
      result.second = part.value;
    }
  }
  return result;
}

// Зсув Києва від UTC у мілісекундах у заданий момент (+2 або +3 години)
function getKyivOffsetMs(date: Date): number {
  const parts = getKyivParts(date);
  const wallTimeAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const dateWithoutMs = Math.floor(date.getTime() / 1000) * 1000;
  return wallTimeAsUtc - dateWithoutMs;
}

// Київська доба у форматі YYYY-MM-DD
export function kyivDay(date: Date): string {
  const parts = getKyivParts(date);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

// Момент початку київської доби (00:00 за Києвом), у якій лежить date
export function startOfKyivDay(date: Date): Date {
  const parts = getKyivParts(date);
  const midnightAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  // Перехід на літній чи зимовий час у Києві не опівночі, тож зсув опівночі сталий
  const firstGuess = midnightAsUtc - getKyivOffsetMs(new Date(midnightAsUtc));
  const offset = getKyivOffsetMs(new Date(firstGuess));
  return new Date(midnightAsUtc - offset);
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
