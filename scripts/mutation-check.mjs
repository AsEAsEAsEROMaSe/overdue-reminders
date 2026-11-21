// Мутаційна перевірка: по черзі вносить у код відому помилку, запускає тести
// і перевіряє, що хоч один тест упав. Після кожної мутації файл повертається як був.
// Запуск: node scripts/mutation-check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
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
    name: 'немає сортування за дедлайном',
    file: 'src/format.ts',
    from: '  sorted.sort(compareByDeadline);\n',
    to: '',
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
    from: '    await deps.lock.release(lockKey);\n',
    to: '',
  },
  {
    name: 'немає зовнішнього catch (збій сховища)',
    file: 'src/run.ts',
    from: '    } catch (error) {\n      // Збій сховища',
    to: '    } catch (error) {\n      throw error;\n      // Збій сховища',
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
    from: '  if (stopped) {',
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
    from: "  if (reason === 'blocked') {\n    final = true;\n  }\n",
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
    from: 'await Promise.race([messenger.send(chatId, text), timeout]);',
    to: 'await messenger.send(chatId, text);',
  },
  {
    name: 'таймер не прибирається',
    file: 'src/run.ts',
    from: '    clearTimeout(timer);\n',
    to: '',
  },
];

const REPORT_FILE = '.vitest/mutation-report.json';

// Запускає vitest і повертає назви тестів, що впали
function runTests() {
  const args = ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', '--outputFile=' + REPORT_FILE];
  spawnSync(process.execPath, args, { encoding: 'utf8' });
  const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));
  const failed = [];
  for (const file of report.testResults) {
    for (const test of file.assertionResults) {
      if (test.status === 'failed') {
        failed.push(test.title);
      }
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
  } finally {
    // Повертаємо файл як був, навіть якщо тести впали з винятком
    writeFileSync(mutation.file, original);
  }

  if (failed.length === 0) {
    survived = survived + 1;
    console.log(number + '. ВИЖИЛА  ' + mutation.name + ' (' + mutation.file + '): жоден тест не впав');
  } else {
    console.log(number + '. спіймано ' + mutation.name + ' (' + mutation.file + '): впало ' + failed.length);
  }
  number = number + 1;
}

if (survived === 0) {
  console.log('Спіймано всі мутації: ' + MUTATIONS.length);
} else {
  console.log('Вижило мутацій: ' + survived + ' з ' + MUTATIONS.length);
  process.exitCode = 1;
}
