// Імітація одного дня нагадувань у консолі: справжній runDailyReminders на моках.
// Запуск: npm run demo
// Усі chat_id вигадані, справжнього Telegram немає.
import { runDailyReminders } from '../src/run.ts';
import { isReminderTime, formatKyivDate } from '../src/time.ts';
import { FakeTaskRepo, FakeUserRepo, FakeMessenger, FakeSentLog, FakeAttemptLog, FakeLock } from '../src/mocks.ts';
import type { Messenger } from '../src/ports.ts';
import type { RunDeps } from '../src/run.types.ts';
import type { RunReport, Task, User } from '../src/types.ts';

// Скільки чекати відповіді Telegram у демо, мс (справжнє очікування)
const SEND_TIMEOUT_MS = 1000;

// Месенджер, що друкує кожну відправку; збої бере з FakeMessenger
class ConsoleMessenger implements Messenger {
  fake = new FakeMessenger();

  async send(chatId: string, text: string): Promise<void> {
    console.log('  → Telegram ' + chatId + ': відправляю...');
    try {
      await this.fake.send(chatId, text);
    } catch (error) {
      console.log('  ✗ ' + chatId + ': ' + String(error));
      throw error;
    }
    console.log('  ✓ ' + chatId + ' отримав:');
    const lines = text.split('\n');
    for (const line of lines) {
      console.log('      ' + line);
    }
  }
}

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

function printTitle(title: string): void {
  console.log('');
  console.log('=== ' + title);
}

function printReport(report: RunReport): void {
  console.log('  звіт:');
  console.log('    sent:    ' + JSON.stringify(report.sent));
  console.log('    skipped:');
  for (const item of report.skipped) {
    console.log('      ' + item.kind + ' ' + item.id + ': ' + item.reason);
  }
  console.log('    failed:');
  for (const item of report.failed) {
    let note = 'наступний запуск спробує знову';
    if (item.final) {
      note = 'сьогодні більше не пробуємо';
    }
    console.log('      ' + item.userId + ': ' + item.reason + ' (' + note + ')');
  }
}

// Час за Києвом для заголовка
function kyiv(date: Date): string {
  return formatKyivDate(date) + ' за Києвом';
}

async function main(): Promise<void> {
  const messenger = new ConsoleMessenger();
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
  messenger.fake.failFor('chat-bohdan', 'rate_limited');
  messenger.fake.failFor('chat-vira', 'blocked');
  messenger.fake.failFor('chat-dmytro', 'hang');

  console.log('Імітація: нагадування про прострочені задачі, 10 березня 2026');
  console.log('anna: дві прострочені, одна на завтра, одна зроблена, один старий запис без дедлайну');
  console.log('bohdan: Telegram відповідає 429 (забагато запитів)');
  console.log('vira: заблокувала бота, 403');
  console.log('dmytro: Telegram не відповідає, таймаут ' + SEND_TIMEOUT_MS + ' мс');
  console.log('hryhorii: немає chat_id; nobody: такого користувача немає');

  const at9 = new Date('2026-03-10T07:00:00Z');
  printTitle(kyiv(at9) + ': планувальник питає isReminderTime');
  console.log('  isReminderTime = ' + isReminderTime(at9) + ', ще рано, нічого не робимо');

  const at10 = new Date('2026-03-10T08:00:00Z');
  printTitle(kyiv(at10) + ': isReminderTime = ' + isReminderTime(at10) + ', запуск 1');
  // Другий запуск у той самий момент, поки перший ще працює
  const firstRun = runDailyReminders(at10, deps);
  const secondReport = await runDailyReminders(at10, deps);
  const firstReport = await firstRun;
  printReport(firstReport);

  printTitle(kyiv(at10) + ': другий процес стартував одночасно з першим');
  console.log('  блокування дня вже зайняте, нічого не шле');
  printReport(secondReport);

  messenger.fake.clearFailure('chat-bohdan');
  const at1015 = new Date('2026-03-10T08:15:00Z');
  printTitle(kyiv(at1015) + ': запуск 2, Telegram знову пропускає bohdan');
  printReport(await runDailyReminders(at1015, deps));

  const at1030 = new Date('2026-03-10T08:30:00Z');
  printTitle(kyiv(at1030) + ': запуск 3, дублів бути не має');
  printReport(await runDailyReminders(at1030, deps));

  const at1045 = new Date('2026-03-10T08:45:00Z');
  printTitle(kyiv(at1045) + ': запуск 4, спроби dmytro вичерпано');
  printReport(await runDailyReminders(at1045, deps));

  messenger.fake.clearFailure('chat-vira');
  messenger.fake.clearFailure('chat-dmytro');
  const nextDay = new Date('2026-03-11T08:00:00Z');
  printTitle(kyiv(nextDay) + ': нова доба, vira розблокувала бота, Telegram відповідає всім');
  printReport(await runDailyReminders(nextDay, deps));

  console.log('');
  console.log('Усього доставлено повідомлень: ' + messenger.fake.sent.length + ', спроб відправки: ' + messenger.fake.attempts.length);
}

main();
