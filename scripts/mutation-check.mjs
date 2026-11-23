// Мутаційна перевірка: по черзі вносить у код відому помилку, запускає тести
// і перевіряє, що впало щонайменше MIN_FAILED тестів. Після кожної мутації файл повертається як був,
// навіть після Ctrl+C.
// Запуск: node scripts/mutation-check.mjs
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// name: коротка назва; file: де ламаємо; from: що міняємо; to: на що
const MUTATIONS = [
  {
    name: 'початок доби за UTC, без поясу Києва',
    file: 'src/time.ts',
    from: '    return winterStart;',
    to: '    return new Date(midnightUtc);',
  },
  {
    name: 'улітку теж зимовий зсув UTC+2',
    file: 'src/time.ts',
    from: '    return summerStart;',
    to: '    return winterStart;',
  },
  {
    name: 'час нагадування за UTC-годиною',
    file: 'src/time.ts',
    from: 'if (Number(parts.hour) === REMINDER_HOUR) {',
    to: 'if (now.getUTCHours() === REMINDER_HOUR) {',
  },
  {
    name: 'години 01..24 замість 00..23',
    file: 'src/time.ts',
    from: "hourCycle: 'h23'",
    to: "hourCycle: 'h24'",
  },
  {
    name: 'дата у форматі ММ.ДД',
    file: 'src/time.ts',
    from: "return parts.day + '.' + parts.month",
    to: "return parts.month + '.' + parts.day",
  },
  {
    name: 'місяць у Date.UTC без поправки на нуль',
    file: 'src/time.ts',
    from: 'Date.UTC(year, month - 1, day)',
    to: 'Date.UTC(year, month, day)',
  },
  {
    name: 'доба у форматі РРРР-ДД-ММ',
    file: 'src/time.ts',
    from: "return parts.year + '-' + parts.month + '-' + parts.day;",
    to: "return parts.year + '-' + parts.day + '-' + parts.month;",
  },
  {
    name: 'хвилини завжди 00',
    file: 'src/time.ts',
    from: 'result.minute = part.value;',
    to: "result.minute = '00';",
  },
  {
    name: 'рік завжди 2026',
    file: 'src/time.ts',
    from: 'result.year = part.value;',
    to: "result.year = '2026';",
  },
  {
    name: 'немає перевірки статусу done',
    file: 'src/overdue.ts',
    from: "    if (task.status === 'done') {\n      continue;\n    }\n",
    to: '',
  },
  {
    name: 'прострочено відносно «зараз», а не початку доби',
    file: 'src/overdue.ts',
    from: 'task.deadline.getTime() >= dayStart.getTime()',
    to: 'task.deadline.getTime() >= now.getTime()',
  },
  {
    name: 'немає перевірки дедлайну',
    file: 'src/overdue.ts',
    from: '    if (!hasValidDeadline(task)) {',
    to: '    if (false) {',
  },
  {
    name: 'виконавця перевіряємо раніше за дедлайн',
    file: 'src/overdue.ts',
    from: "    if (!hasValidDeadline(task)) {\n      skipped.push({ kind: 'task', id: task.id, reason: 'no_deadline' });\n      continue;\n    }\n    if (!task.assigneeId) {\n      skipped.push({ kind: 'task', id: task.id, reason: 'no_assignee' });\n      continue;\n    }\n",
    to: "    if (!task.assigneeId) {\n      skipped.push({ kind: 'task', id: task.id, reason: 'no_assignee' });\n      continue;\n    }\n    if (!hasValidDeadline(task)) {\n      skipped.push({ kind: 'task', id: task.id, reason: 'no_deadline' });\n      continue;\n    }\n",
  },
  {
    name: 'дедлайн рядком теж приймаємо',
    file: 'src/overdue.ts',
    from: '  if (isDate === false) {',
    to: '  if (false) {',
  },
  {
    name: 'нумерація з нуля',
    file: 'src/format.ts',
    from: '  let number = 1;',
    to: '  let number = 0;',
  },
  {
    name: 'немає перевірки виконавця',
    file: 'src/overdue.ts',
    from: '    if (!task.assigneeId) {',
    to: '    if (false) {',
  },
  {
    name: 'групу не знаходимо, кожна задача окремим повідомленням',
    file: 'src/overdue.ts',
    from: '      return group;',
    to: '      return undefined;',
  },
  {
    name: 'сортуємо вхідний масив без копії',
    file: 'src/format.ts',
    from: 'const sorted = tasks.slice();',
    to: 'const sorted = tasks;',
  },
  {
    name: 'немає сортування за дедлайном',
    file: 'src/format.ts',
    from: '  sorted.sort(compareByDeadline);\n',
    to: '',
  },
  {
    name: 'сховище задач без копії вхідного масиву',
    file: 'src/mocks.ts',
    from: 'this.tasks = tasks.slice();',
    to: 'this.tasks = tasks;',
  },
  {
    name: 'сховище користувачів без копії вхідного масиву',
    file: 'src/mocks.ts',
    from: 'this.users = users.slice();',
    to: 'this.users = users;',
  },
  {
    name: 'таймаут завжди 10000 замість deps.sendTimeoutMs',
    file: 'src/run.ts',
    from: 'deps.sendTimeoutMs);',
    to: '10000);',
  },
  {
    name: 'будь-який код 4xx і вище як blocked',
    file: 'src/run.ts',
    from: '    if (error.code === 403) {',
    to: '    if (error.code >= 400) {',
  },
  {
    name: 'будь-який код від 429 як rate_limited',
    file: 'src/run.ts',
    from: '    if (error.code === 429) {',
    to: '    if (error.code >= 429) {',
  },
  {
    name: 'невідома помилка як rate_limited',
    file: 'src/run.ts',
    from: "  }\n  return 'error';\n}",
    to: "  }\n  return 'rate_limited';\n}",
  },
  {
    name: 'таймаут не розпізнається',
    file: 'src/run.ts',
    from: '  if (error instanceof SendTimeoutError) {',
    to: '  if (false) {',
  },
  {
    name: 'відправка на id користувача замість chat_id',
    file: 'src/run.ts',
    from: 'user.telegramChatId, text',
    to: 'userId, text',
  },
  {
    name: 'ключ блокування без дня',
    file: 'src/run.ts',
    from: "const lockKey = 'daily-reminders:' + day;",
    to: "const lockKey = 'daily-reminders';",
  },
  {
    name: 'знімаємо чуже блокування',
    file: 'src/run.ts',
    from: '  if (!acquired) {\n    return report;\n  }\n\n  try {\n',
    to: '  try {\n    if (!acquired) {\n      return report;\n    }\n',
  },
  {
    name: 'release звільняє всі ключі',
    file: 'src/mocks.ts',
    from: '      if (takenKey !== key) {',
    to: '      if (false) {',
  },
  {
    name: 'clearFailure прибирає всі збої',
    file: 'src/mocks.ts',
    from: '      if (failure.chatId !== chatId) {\n        left.push(failure);',
    to: '      if (false) {\n        left.push(failure);',
  },
  {
    name: 'лічильник спроб спільний для всіх',
    file: 'src/mocks.ts',
    from: '      if (attempt === key) {',
    to: '      if (true) {',
  },
  {
    name: 'код TelegramError не зберігається',
    file: 'src/errors.ts',
    from: '    this.code = code;',
    to: '    this.code = 0;',
  },
  {
    name: 'синхронний збій send не прибирає таймер',
    file: 'src/run.ts',
    from: '    } catch (error) {\n      onError(error);\n      return;\n    }',
    to: '    } catch (error) {\n      reject(error);\n      return;\n    }',
  },
  {
    name: 'після 403 зупинка з причиною attempts_exhausted',
    file: 'src/run.ts',
    from: "        reasonToSave = 'blocked';",
    to: "        reasonToSave = 'attempts_exhausted';",
  },
  {
    name: 'запис зупинки завжди з причиною blocked',
    file: 'src/run.ts',
    from: "      let reasonToSave = 'attempts_exhausted';",
    to: "      let reasonToSave = 'blocked';",
  },
  {
    name: 'збій mark як звичайна помилка error',
    file: 'src/run.ts',
    from: "reason: 'mark_failed'",
    to: "reason: 'error'",
  },
  {
    name: 'запуск змінює задачу з бази',
    file: 'src/run.ts',
    from: '  const alreadySent = await deps.sentLog.has(userId, day);',
    to: '  group.tasks[0].title = group.tasks[0].title;\n  const alreadySent = await deps.sentLog.has(userId, day);',
  },
  {
    name: 'немає Lock',
    file: 'src/run.ts',
    from: '  if (!acquired) {',
    to: '  if (false) {',
  },
  {
    name: 'немає release',
    file: 'src/run.ts',
    from: '      await deps.lock.release(lockKey);\n',
    to: '',
  },
  {
    name: 'збій release губить звіт (без try навколо release)',
    file: 'src/run.ts',
    from: '    } catch (error) {\n      // Нічого не робимо: блокування нового дня має інший ключ\n    }\n',
    to: '    } finally {\n    }\n',
  },
  {
    name: 'немає зовнішнього catch (збій сховища)',
    file: 'src/run.ts',
    from: '      } catch (error) {\n        // Збій сховища',
    to: '      } catch (error) {\n        throw error;\n        // Збій сховища',
  },
  {
    name: 'немає внутрішнього catch (збій відправки)',
    file: 'src/run.ts',
    from: '  } catch (error) {\n    // mark не ставимо',
    to: '  } catch (error) {\n    throw error;\n    // mark не ставимо',
  },
  {
    name: 'немає перевірки «користувача не знайдено»',
    file: 'src/run.ts',
    from: '  if (user === undefined) {',
    to: '  if (false) {',
  },
  {
    name: 'немає перевірки chat_id',
    file: 'src/run.ts',
    from: '  if (!user.telegramChatId) {',
    to: '  if (false) {',
  },
  {
    name: 'немає перевірки SentLog',
    file: 'src/run.ts',
    from: '  if (alreadySent) {',
    to: '  if (false) {',
  },
  {
    name: 'немає перевірки «сьогодні більше не пробувати»',
    file: 'src/run.ts',
    from: '  if (stopReason !== undefined) {',
    to: '  if (false) {',
  },
  {
    name: 'mark до відправки',
    file: 'src/run.ts',
    from: '  const text = buildReminderText(group.tasks);',
    to: '  await deps.sentLog.mark(userId, day);\n  const text = buildReminderText(group.tasks);',
  },
  {
    name: '403 не остаточний',
    file: 'src/run.ts',
    from: "    if (reason === 'blocked') {\n      final = true;\n    }\n",
    to: '',
  },
  {
    name: 'ліміт 99 спроб замість 3',
    file: 'src/run.ts',
    from: 'const MAX_ATTEMPTS = 3;',
    to: 'const MAX_ATTEMPTS = 99;',
  },
  {
    name: 'немає таймауту',
    file: 'src/run.ts',
    from: '      reject(new SendTimeoutError());',
    to: '',
  },
  {
    name: 'таймер не прибирається після успіху',
    file: 'src/run.ts',
    from: '      clearTimeout(timer);\n      resolve();',
    to: '      resolve();',
  },
  {
    name: 'таймер не прибирається після помилки',
    file: 'src/run.ts',
    from: '      clearTimeout(timer);\n      reject(error);',
    to: '      reject(error);',
  },
];

const REPORT_FILE = '.vitest/mutation-report.json';
// Скільки тестів мінімум мають помітити кожну мутацію
const MIN_FAILED = 2;
// Скільки чекати один прогін тестів, мс: зависла мутація теж рахується спійманою
const RUN_TIMEOUT_MS = 120000;

// Ctrl+C: не вмирати одразу, а дати finally повернути файл.
// Сам vitest від Ctrl+C завершиться, і runTests побачить сигнал
process.on('SIGINT', function () {});

// Запускає vitest і повертає список того, що впало:
// назви тестів, файли тестів, що не завантажились, або опис збою самого прогону
function runTests() {
  // Старий звіт видаляємо, щоб випадково не прочитати попередній прогін
  rmSync(REPORT_FILE, { force: true });

  const args = ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', '--outputFile=' + REPORT_FILE];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: RUN_TIMEOUT_MS });

  if (result.signal === 'SIGINT') {
    throw new Error('Перервано через Ctrl+C');
  }

  const failed = [];
  if (result.error !== undefined) {
    failed.push('прогін тестів не завершився: ' + result.error.message);
    return failed;
  }
  if (!existsSync(REPORT_FILE)) {
    failed.push('vitest не записав звіт, код виходу ' + result.status);
    return failed;
  }

  const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));
  for (const file of report.testResults) {
    // Файл тестів не завантажився (наприклад, синтаксична помилка в коді)
    if (file.status === 'failed') {
      if (file.assertionResults.length === 0) {
        failed.push('не завантажився ' + file.name);
      }
    }
    for (const test of file.assertionResults) {
      if (test.status === 'failed') {
        failed.push(test.title);
      }
    }
  }

  // Тести впали, але звіт не назвав жодного: однаково вважаємо падінням
  if (result.status !== 0) {
    if (failed.length === 0) {
      failed.push('vitest завершився з кодом ' + result.status);
    }
  }
  return failed;
}

const baseline = runTests();
if (baseline.length > 0) {
  console.log('Тести падають і без мутацій, спершу полагодь їх: ' + baseline.join('; '));
  process.exit(1);
}

let survived = 0;
let weak = 0;
let number = 1;
for (const mutation of MUTATIONS) {
  const original = readFileSync(mutation.file, 'utf8');
  if (!original.includes(mutation.from)) {
    console.log('ПОМИЛКА у списку мутацій: не знайдено текст для «' + mutation.name + '» у ' + mutation.file);
    process.exit(1);
  }

  let failed = [];
  try {
    writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
    failed = runTests();
  } catch (error) {
    writeFileSync(mutation.file, original);
    console.log(String(error) + '. Файл ' + mutation.file + ' повернуто як був.');
    process.exit(130);
  } finally {
    // Повертаємо файл як був за будь-якого результату
    writeFileSync(mutation.file, original);
  }

  const where = ' (' + mutation.file + ')';
  if (failed.length === 0) {
    survived = survived + 1;
    console.log(number + '. ВИЖИЛА  ' + mutation.name + where + ': жоден тест не впав');
  }
  if (failed.length > 0) {
    if (failed.length < MIN_FAILED) {
      weak = weak + 1;
      console.log(number + '. СЛАБКО  ' + mutation.name + where + ': впало лише ' + failed.length + ' (' + failed.join('; ') + ')');
    }
    if (failed.length >= MIN_FAILED) {
      console.log(number + '. спіймано ' + mutation.name + where + ': впало ' + failed.length);
    }
  }
  number = number + 1;
}

if (survived === 0) {
  if (weak === 0) {
    console.log('Спіймано всі мутації: ' + MUTATIONS.length + ', кожну щонайменше ' + MIN_FAILED + ' тестами');
  }
}
if (survived > 0) {
  console.log('Вижило мутацій: ' + survived + ' з ' + MUTATIONS.length);
  process.exitCode = 1;
}
if (weak > 0) {
  console.log('Мутацій, які ловить менше ' + MIN_FAILED + ' тестів: ' + weak);
  process.exitCode = 1;
}
