/**
 * @file Тести часу за Києвом: доба, початок доби, час нагадування, формат дати.
 * @module time.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/time.ts}
 */

import { describe, it, expect } from 'vitest';
import { kyivDay, startOfKyivDay, isReminderTime, formatKyivDate } from '../src/time.ts';

describe('kyivDay', () => {
  it('23:30 UTC 9 березня це вже 10 березня за Києвом', () => {
    expect(kyivDay(new Date('2026-03-09T23:30:00Z'))).toBe('2026-03-10');
  });

  it('21:59 UTC 9 березня це ще 9 березня за Києвом', () => {
    expect(kyivDay(new Date('2026-03-09T21:59:00Z'))).toBe('2026-03-09');
  });
});

describe('startOfKyivDay', () => {
  it('зимовий час: північ за Києвом це 22:00 UTC попередньої доби', () => {
    const result = startOfKyivDay(new Date('2026-03-10T08:00:00Z'));
    expect(result.toISOString()).toBe('2026-03-09T22:00:00.000Z');
  });

  it('літній час: північ за Києвом це 21:00 UTC попередньої доби', () => {
    const result = startOfKyivDay(new Date('2026-07-15T07:00:00Z'));
    expect(result.toISOString()).toBe('2026-07-14T21:00:00.000Z');
  });

  it('день переходу на літній час (29 березня 2026)', () => {
    const result = startOfKyivDay(new Date('2026-03-29T12:00:00Z'));
    expect(result.toISOString()).toBe('2026-03-28T22:00:00.000Z');
  });

  it('день переходу на зимовий час (25 жовтня 2026)', () => {
    const result = startOfKyivDay(new Date('2026-10-25T12:00:00Z'));
    expect(result.toISOString()).toBe('2026-10-24T21:00:00.000Z');
  });
});

describe('isReminderTime (тест брифу 2)', () => {
  it('січень: 08:00 UTC це 10:00 за Києвом', () => {
    expect(isReminderTime(new Date('2026-01-15T08:00:00Z'))).toBe(true);
  });

  it('липень: 07:00 UTC це 10:00 за Києвом', () => {
    expect(isReminderTime(new Date('2026-07-15T07:00:00Z'))).toBe(true);
  });

  it('січень: 07:00 UTC це 09:00 за Києвом, ще рано', () => {
    expect(isReminderTime(new Date('2026-01-15T07:00:00Z'))).toBe(false);
  });

  it('липень: 08:00 UTC це 11:00 за Києвом, вже пізно', () => {
    expect(isReminderTime(new Date('2026-07-15T08:00:00Z'))).toBe(false);
  });

  it('10:59 за Києвом ще час нагадування', () => {
    expect(isReminderTime(new Date('2026-01-15T08:59:00Z'))).toBe(true);
  });
});

describe('formatKyivDate', () => {
  it('дата і час за Києвом у форматі ДД.ММ.РРРР ГГ:ХХ', () => {
    expect(formatKyivDate(new Date('2026-03-09T23:30:00Z'))).toBe('10.03.2026 01:30');
  });

  it('північ показується як 00:00 наступної доби, а не 24:00', () => {
    expect(formatKyivDate(new Date('2026-01-10T22:00:00Z'))).toBe('11.01.2026 00:00');
  });
});
