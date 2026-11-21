/**
 * @file Тести часу за Києвом: доба, початок доби, час нагадування, формат дати.
 * @module time.test
 *
 * Нижчі (кого використовує):
 * @see {@link ../src/time.ts}
 */

import { describe, it, expect } from 'vitest';
import { kyivDay, startOfKyivDay, isReminderTime, formatKyivDate } from '../src/time.ts';

// Київ: зима UTC+2, літо UTC+3.
// У 2026 році літній час з 29 березня (03:00 → 04:00), зимовий з 25 жовтня (04:00 → 03:00).

describe('kyivDay', () => {
  it('23:30 UTC 9 березня це вже 10 березня за Києвом', () => {
    const result = kyivDay(new Date('2026-03-09T23:30:00Z'));

    expect(result).toBe('2026-03-10');
  });

  it('за мілісекунду до півночі за Києвом ще попередня доба (зима)', () => {
    const result = kyivDay(new Date('2026-03-09T21:59:59.999Z'));

    expect(result).toBe('2026-03-09');
  });

  it('рівно північ за Києвом це вже нова доба (зима)', () => {
    const result = kyivDay(new Date('2026-03-09T22:00:00.000Z'));

    expect(result).toBe('2026-03-10');
  });

  it('рівно північ за Києвом це вже нова доба (літо)', () => {
    const result = kyivDay(new Date('2026-07-14T21:00:00.000Z'));

    expect(result).toBe('2026-07-15');
  });

  it('за мілісекунду до півночі за Києвом ще попередня доба (літо)', () => {
    const result = kyivDay(new Date('2026-07-14T20:59:59.999Z'));

    expect(result).toBe('2026-07-14');
  });

  it('новий рік за Києвом настає о 22:00 UTC 31 грудня', () => {
    const result = kyivDay(new Date('2025-12-31T22:00:00Z'));

    expect(result).toBe('2026-01-01');
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

  it('день переходу на літній час (29 березня 2026): північ ще за зимовим часом', () => {
    const result = startOfKyivDay(new Date('2026-03-29T12:00:00Z'));

    expect(result.toISOString()).toBe('2026-03-28T22:00:00.000Z');
  });

  it('день переходу на зимовий час (25 жовтня 2026): північ ще за літнім часом', () => {
    const result = startOfKyivDay(new Date('2026-10-25T12:00:00Z'));

    expect(result.toISOString()).toBe('2026-10-24T21:00:00.000Z');
  });

  it('наступний день після переходу на літній час: північ уже за літнім часом', () => {
    const result = startOfKyivDay(new Date('2026-03-30T12:00:00Z'));

    expect(result.toISOString()).toBe('2026-03-29T21:00:00.000Z');
  });

  it('якщо зараз рівно північ за Києвом, повертає цей самий момент', () => {
    const midnight = new Date('2026-03-09T22:00:00.000Z');

    const result = startOfKyivDay(midnight);

    expect(result.toISOString()).toBe('2026-03-09T22:00:00.000Z');
  });

  it('за мілісекунду до кінця доби повертає початок тієї ж доби', () => {
    const result = startOfKyivDay(new Date('2026-03-10T21:59:59.999Z'));

    expect(result.toISOString()).toBe('2026-03-09T22:00:00.000Z');
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

  it('09:59:59 за Києвом ще не час', () => {
    expect(isReminderTime(new Date('2026-01-15T07:59:59Z'))).toBe(false);
  });

  it('10:59 за Києвом ще час нагадування', () => {
    expect(isReminderTime(new Date('2026-01-15T08:59:00Z'))).toBe(true);
  });

  it('11:00 за Києвом вже не час', () => {
    expect(isReminderTime(new Date('2026-01-15T09:00:00Z'))).toBe(false);
  });

  it('у день переходу на літній час 10:00 за Києвом це 07:00 UTC', () => {
    expect(isReminderTime(new Date('2026-03-29T07:00:00Z'))).toBe(true);
    expect(isReminderTime(new Date('2026-03-29T08:00:00Z'))).toBe(false);
  });

  it('у день переходу на зимовий час 10:00 за Києвом це 08:00 UTC', () => {
    expect(isReminderTime(new Date('2026-10-25T08:00:00Z'))).toBe(true);
    expect(isReminderTime(new Date('2026-10-25T07:00:00Z'))).toBe(false);
  });
});

describe('formatKyivDate', () => {
  it('дата і час за Києвом у форматі ДД.ММ.РРРР ГГ:ХХ', () => {
    expect(formatKyivDate(new Date('2026-03-09T23:30:00Z'))).toBe('10.03.2026 01:30');
  });

  it('північ показується як 00:00 наступної доби, а не 24:00', () => {
    expect(formatKyivDate(new Date('2026-01-10T22:00:00Z'))).toBe('11.01.2026 00:00');
  });

  it('одноцифрові день, місяць, години і хвилини доповнюються нулем', () => {
    expect(formatKyivDate(new Date('2026-01-05T01:07:00Z'))).toBe('05.01.2026 03:07');
  });

  it('літній час: додає 3 години до UTC', () => {
    expect(formatKyivDate(new Date('2026-07-15T20:45:00Z'))).toBe('15.07.2026 23:45');
  });

  it('секунди не показуються і не округлюються', () => {
    expect(formatKyivDate(new Date('2026-01-15T08:59:59Z'))).toBe('15.01.2026 10:59');
  });
});
