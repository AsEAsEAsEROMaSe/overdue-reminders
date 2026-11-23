// Імітація дня нагадувань у консолі: справжній runDailyReminders на моках.
// Запуск: npm run demo (без кольорів: NO_COLOR=1 npm run demo)
// Усі chat_id вигадані, справжнього Telegram немає.
import { runDailyReminders } from '../src/run.ts';
import { isReminderTime, formatKyivDate } from '../src/time.ts';
import { FakeTaskRepo, FakeUserRepo, FakeMessenger, FakeSentLog, FakeAttemptLog, FakeLock } from '../src/mocks.ts';
import type { RunDeps } from '../src/run.types.ts';
import type { RunReport, Task, User } from '../src/types.ts';

// Скільки чекати відповіді Telegram у демо, мс (справжнє очікування)
const SEND_TIMEOUT_MS = 1000;

// Виконавці з простроченими задачами, у порядку виводу
const PEOPLE = ['anna', 'bohdan', 'vira', 'dmytro'];

// ===== Кольори =====

// Обгортає текст ANSI-кодом кольору; з NO_COLOR повертає текст як є
function paint(code: string, text: string): string {
  if (process.env.NO_COLOR !== undefined) {
    return text;
  }
  return '\x1b[' + code + 'm' + text + '\x1b[0m';
}

function green(text: string): string {
  return paint('32', text);
}

function red(text: string): string {
  return paint('31', text);
}

function yellow(text: string): string {
  return paint('33', text);
}

function cyan(text: string): string {
  return paint('1;36', text);
}

function gray(text: string): string {
  return paint('90', text);
}

function bold(text: string): string {
  return paint('1', text);
}

// ===== Дані =====

function makeTask(id: string, assigneeId: string, title: string, deadlineIso: string, status: Task['status']): Task {
  const task: Task = {
    id: id,
    assigneeId: assigneeId,
    title: title,
    deadline: new Date(deadlineIso),
    status: status,
  };
  return task;
}

// Задачі з бази; останні дві навмисно погані
function makeTasks(): Task[] {
  const tasks: Task[] = [
    makeTask('t1', 'anna', 'Рахунок для ТОВ «Сонце»', '2026-03-05T10:00:00Z', 'open'),
    makeTask('t2', 'anna', 'Договір оренди', '2026-03-02T10:00:00Z', 'in_progress'),
    makeTask('t3', 'anna', 'Звіт на завтра', '2026-03-11T10:00:00Z', 'open'),
    makeTask('t4', 'anna', 'Вже зроблене', '2026-03-01T10:00:00Z', 'done'),
    makeTask('t5', 'bohdan', 'Квартальний звіт', '2026-03-06T10:00:00Z', 'open'),
    makeTask('t6', 'vira', 'Акт звірки', '2026-03-07T10:00:00Z', 'open'),
    makeTask('t7', 'dmytro', 'Накладні', '2026-03-08T10:00:00Z', 'open'),
    makeTask('t8', 'hryhorii', 'Інвентаризація', '2026-03-04T10:00:00Z', 'open'),
    makeTask('t9', 'nobody', 'Задача звільненого', '2026-03-03T10:00:00Z', 'open'),
  ];
  // Старий запис без дедлайну: так буває в базі
  const oldRecord = { id: 't10', assigneeId: 'anna', title: 'Старий запис', status: 'open' };
  tasks.push(oldRecord as unknown as Task);
  return tasks;
}

function makeUsers(): User[] {
  const users: User[] = [
    { id: 'anna', telegramChatId: 'chat-anna' },
    { id: 'bohdan', telegramChatId: 'chat-bohdan' },
    { id: 'vira', telegramChatId: 'chat-vira' },
    { id: 'dmytro', telegramChatId: 'chat-dmytro' },
    // Ще не підключив Telegram
    { id: 'hryhorii', telegramChatId: '' },
  ];
  return users;
}

// ===== Вивід =====

// Причина збою людською мовою
function failureText(reason: string): string {
  if (reason === 'rate_limited') {
    return '429, забагато запитів';
  }
  if (reason === 'blocked') {
    return '403, бот заблоковано';
  }
  if (reason === 'timeout') {
    return 'не відповів за ' + SEND_TIMEOUT_MS / 1000 + ' с';
  }
  if (reason === 'attempts_exhausted') {
    return 'спроби на сьогодні вичерпано';
  }
  if (reason === 'mark_failed') {
    return 'доставлено, але позначка не записалась';
  }
  return 'невідома помилка';
}

// Причина пропуску людською мовою
function skippedText(reason: string): string {
  if (reason === 'no_deadline') {
    return 'без дедлайну';
  }
  if (reason === 'no_assignee') {
    return 'без виконавця';
  }
  if (reason === 'no_chat_id') {
    return 'без chat_id';
  }
  if (reason === 'user_not_found') {
    return 'немає в базі';
  }
  return reason;
}

function printHeader(date: Date, title: string): void {
  const time = formatKyivDate(date);
  console.log('');
  console.log(cyan('━━ ' + time + '  ' + title + ' ' + '━'.repeat(Math.max(3, 44 - title.length))));
}

// Рядок одного виконавця: значок, ім'я, що сталося
function printPerson(mark: string, name: string, text: string): void {
  console.log('  ' + mark + ' ' + bold(name.padEnd(8)) + ' ' + text);
}

// Текст повідомлення в рамці
function printMessage(text: string): void {
  const lines = text.split('\n');
  for (const line of lines) {
    console.log('             ' + gray('│ ') + line);
  }
}

// Друкує результат запуску: по рядку на виконавця і пропущені одним рядком.
// sentFrom: з якого номера в messenger.sent починаються повідомлення цього запуску.
// showSkipped: пропущені однакові весь день, тож друкуємо їх лише в першому запуску дня
function printReport(report: RunReport, messenger: FakeMessenger, sentFrom: number, showSkipped: boolean): void {
  for (const person of PEOPLE) {
    if (report.sent.includes(person)) {
      printPerson(green('✓'), person, green('нагадування доставлено'));
      for (let i = sentFrom; i < messenger.sent.length; i = i + 1) {
        if (messenger.sent[i].chatId === 'chat-' + person) {
          printMessage(messenger.sent[i].text);
        }
      }
      continue;
    }

    let failedItem = undefined;
    for (const item of report.failed) {
      if (item.userId === person) {
        failedItem = item;
      }
    }
    if (failedItem !== undefined) {
      const text = failureText(failedItem.reason);
      if (failedItem.reason === 'attempts_exhausted') {
        printPerson(red('✗'), person, red(text));
        continue;
      }
      if (failedItem.final) {
        printPerson(red('✗'), person, red(text) + gray('  сьогодні більше не пробуємо'));
        continue;
      }
      printPerson(yellow('↻'), person, yellow(text) + gray('  спробуємо наступним запуском'));
      continue;
    }

    // Користувач без chat_id чи якого немає в базі: показуємо причину
    let skippedReason = '';
    for (const item of report.skipped) {
      if (item.id === person) {
        skippedReason = item.reason;
      }
    }
    if (skippedReason !== '') {
      printPerson(gray('·'), person, gray('пропущено: ' + skippedText(skippedReason)));
      continue;
    }

    printPerson(gray('·'), person, gray('сьогодні вже доставлено'));
  }

  if (showSkipped === false) {
    return;
  }
  const parts: string[] = [];
  for (const item of report.skipped) {
    parts.push(item.id + ' ' + skippedText(item.reason));
  }
  if (parts.length > 0) {
    console.log(gray('  пропущено: ' + parts.join(', ')));
  }
}

// Запускає один прогін і друкує його результат
async function runAndPrint(date: Date, title: string, deps: RunDeps, messenger: FakeMessenger, showSkipped: boolean): Promise<void> {
  printHeader(date, title);
  const sentFrom = messenger.sent.length;
  const report = await runDailyReminders(date, deps);
  printReport(report, messenger, sentFrom, showSkipped);
}

async function main(): Promise<void> {
  const messenger = new FakeMessenger();
  const deps: RunDeps = {
    taskRepo: new FakeTaskRepo(makeTasks()),
    userRepo: new FakeUserRepo(makeUsers()),
    messenger: messenger,
    sentLog: new FakeSentLog(),
    attemptLog: new FakeAttemptLog(),
    lock: new FakeLock(),
    sendTimeoutMs: SEND_TIMEOUT_MS,
  };

  // Що зламано в Telegram на початку дня
  messenger.failFor('chat-bohdan', 'rate_limited');
  messenger.failFor('chat-vira', 'blocked');
  messenger.failFor('chat-dmytro', 'hang');

  console.log(bold('Нагадування про прострочені задачі') + gray('  імітація, час за Києвом'));
  console.log(gray('Telegram зранку: bohdan отримує 429, vira заблокувала бота, dmytro не відповідає'));

  const at9 = new Date('2026-03-10T07:00:00Z');
  printHeader(at9, 'планувальник');
  console.log(gray('  ще не 10:00, запуску немає (isReminderTime = ' + isReminderTime(at9) + ')'));

  // Запуск 1 і одночасно другий процес
  const at10 = new Date('2026-03-10T08:00:00Z');
  printHeader(at10, 'запуск 1');
  const firstRun = runDailyReminders(at10, deps);
  const parallelReport = await runDailyReminders(at10, deps);
  const firstReport = await firstRun;
  printReport(firstReport, messenger, 0, true);
  if (parallelReport.sent.length === 0) {
    console.log(gray('  ⏸ другий процес стартував одночасно: блокування зайняте, він нічого не робить'));
  }

  messenger.clearFailure('chat-bohdan');
  await runAndPrint(new Date('2026-03-10T08:15:00Z'), 'запуск 2, Telegram пропускає bohdan', deps, messenger, false);
  await runAndPrint(new Date('2026-03-10T08:30:00Z'), 'запуск 3', deps, messenger, false);
  await runAndPrint(new Date('2026-03-10T08:45:00Z'), 'запуск 4', deps, messenger, false);

  messenger.clearFailure('chat-vira');
  messenger.clearFailure('chat-dmytro');
  await runAndPrint(new Date('2026-03-11T08:00:00Z'), 'наступний день, Telegram працює', deps, messenger, true);

  console.log('');
  console.log(cyan('━━ Підсумок'));
  console.log('  доставлено ' + green(String(messenger.sent.length)) + ', спроб відправки ' + messenger.attempts.length);
}

main();
