Гілка `feat/overdue-reminders`, локально, не запушено. План: PLAN.md, «Етап 2». (23.11.2026: запушено в публічне репо, історію перед пушем переписано лише заради пошти автора, див. journal/README.md)

# Журнал 21.11.2026: спрощення і тести

Старт: 40 тестів зелені, коміт eff904d.

## Кроки
| # | Що | Коміт | Перевірка |
|---|---|---|---|
| 1 | format.ts: for...of | 529d130 | 40 з 40 |
| 2 | time.ts: UTC+2 або UTC+3; вимкнено noUncheckedIndexedAccess, щоб не писати `??` заради tsc | 1abea30 | 40 з 40 |
| 3 | run.ts: remindUser, recordFailure, SendTimeoutError, один catch; sendTimeoutMs обов'язковий | 1352da3 | 40 з 40 |
| 4 | баг: збій UserRepo валив запуск | 1eec035 | тест падав «база недоступна», після фіксу 41 з 41 |
| 5 | AttemptLog: count, add, stop, isStopped | 0a475e1 | 41 з 41; тест 403 перевіряє isStopped замість «count = 3» |
| 6, 7 | тести переписано: builders.ts, AAA, фейковий годинник, 41 → 75 | b9736dd | одразу зелені, перевірено мутаціями (крок 8) |
| 8 | scripts/mutation-check.mjs, `npm run check:mutations`, 22 мутації | 9cadd87 | усі спіймано; дві ловив 1 тест, додано по другому: 77 тестів |
| 9 | README, PLAN | див. git log | тире немає, стиль-grep чистий |

Підсумок: 77 тестів, tsc чистий, шапки 12 з 12, мутації 22 з 22.
Vitest 5 пише JSON-звіт у файл, не в stdout: скрипт читає `.vitest/mutation-report.json` (у .gitignore).

## Переглянуто й лишено
- `await new Promise<void>(() => {})` у моці «hang»: свідомо, імітує Telegram, що не відповідає.
- Причина `attempts_exhausted` і для 403 на наступних запусках: очікування тесту брифу 7 не міняла.
- Дубль можливий, якщо впав `SentLog.mark` після успіху або відповідь прийшла після таймауту: записано в README.

## Кандидати далі

## Етап 3: ще джуновіше (21.11.2026)
Відгук: «код все ще зависокорівнений». План у PLAN.md, «Етап 3», підтверджено.
- Крок 1, c9bf2ec: mocks.ts на класах Fake* з масивами, тести через makeDeps без деструктуризації. 77 passed, tsc 0, шапки ок, мутації 22 з 22.
- Крок 2, 4511a53: time.ts: частини дати явними if, isKyivMidnight, winterStart і summerStart окремими if. Нова мутація «улітку теж UTC+2». 77 passed, tsc 0, мутації 23 з 23.
- Крок 3, 1d5f9c5: overdue.ts: findGroup, isDate без !(instanceof). Нова мутація на групування (ловлять 3 тести). 77 passed, tsc 0, мутації 24 з 24.
- Крок 4 і 5, 2d7923b: run.ts: runDailyReminders і remindUser (повертає UserResult, цикл пише у звіт), без sendReminders і recordFailure. Таймаут: new Promise, setTimeout, onSent і onError прибирають таймер. SendTimeoutError з конструктором. Мутації: таймер окремо для успіху і помилки, кожну спершу ловив 1 тест, додано 2 тести (403, одна успішна). 79 passed, tsc 0, мутації 25 з 25.
- Документація 67ef928: README (класи Fake*, дві функції, таймаут), PLAN етап 3 позначено виконаним. Фінал: 79 passed, tsc 0, шапки ок, мутації 25 з 25. Не запушено.
- Типи назовні, 607c901: run.types.ts (RunDeps, UserResult), time.types.ts (KyivParts), overdue.types.ts (OverdueResult), mocks.types.ts (FailureKind, SentMessage, Failure), errors.ts (TelegramError, SendTimeoutError). 79 passed, tsc 0, шапки 17 файлів ок, мутації 25 з 25.

## Аудит мутацій і присвоєнь (21.11.2026)
- grep: let, присвоєння, push/sort/splice. Усі let і push локальні (лічильники, текст, звіт, групи); sort лише на копії slice.
- Доведено тимчасовим тестом з Object.freeze на задачах і користувачах (два запуски, 403, done, без дедлайну, без chat_id, невідомий виконавець): нічого не змінюється, тест пройшов, файл прибрано.
- Захисту немає: поля типів не readonly, слайс у format.ts не покритий мутацією, FakeTaskRepo і FakeUserRepo тримають чужі посилання, тести перезаписують поля deps (7 місць), overdue.test.ts:95 правка зібраного об'єкта.
- Запропоновано план, чекаю підтвердження.
- Крок 1 і 2, 017bed7: freezeTasks, freezeUsers у builders; тести на незмінність у format (1), overdue (2), run (3). Тести одразу зелені, бо код і так не мутує; силу доводить нова мутація «сортуємо вхідний масив без копії» (ловлять 2). 85 passed, tsc 0, мутації 26 з 26.
- Крок 3, 83e63f9: readonly на Task, User, UserTasks.userId, SkippedItem, FailedItem; readonly Task[] у groupOverdueByUser і buildReminderText; builders через buildTask; makeDoneTaskWithoutDeadline (tsc сам зловив overdue.test.ts:95). Доведено: тимчасові task.title = ... і sorted = tasks дають TS2540 і TS2339, повернуто. 85 passed, tsc 0, мутації 26 з 26.
- Крок 4, 8c4d8ca: test/mocks.test.ts спершу (2 з 3 впали), потім slice у конструкторах FakeTaskRepo і FakeUserRepo. Копію User не робила: поля readonly. 2 мутації, кожну ловлять 2 тести. 90 passed, tsc 0, мутації 28 з 28.
- Крок 5, b21a3db: test/faulty.ts (TaskRepoFailingOnce, TaskRepoWithDoneTasks, UserRepoFailingFor, SentLogFailingMarkFor, BrokenMessenger, SlowMessenger); buildDeps у run.test; 7 перезаписів deps прибрано; RunDeps readonly, тож tsc не дасть повернути. 90 passed, tsc 0, мутації 28 з 28, жодну не ловить лише один тест.
- Документація 14df1be. Фінал: 90 passed (5 файлів), tsc 0, шапки ок, мутації 28 з 28. Не запушено.

## Етап 4: тест на кожну змінну (21.11.2026)
Відгук: «тестів мало, варто тестувати всі змінні». План у PLAN.md, «Етап 4», підтверджено; дозволено @vitest/coverage-v8 і прибрати перевірку хвилин.
- Проби до початку (90 тестів зелені при поломці): sendTimeoutMs замінено на 10000; будь-який 4xx як blocked; без перевірки хвилин.
- a2f8ff1: @vitest/coverage-v8 5.1.1, npm run coverage. Вихідне покриття: рядки 98.57%, гілки 93.02% (run.ts:133, time.ts:69 і 97, mocks.ts:80).
- Блок time, d7fe5c5: перевірку хвилин прибрано; +21 тест (рік, місяць, день окремо, високосний, межі 10:00 до мс, 22:00, 00:00, RangeError у всіх чотирьох функціях); +4 мутації. 111 passed, мутації 32 з 32.
- Блок overdue і format, 811fc99: +16 тестів (null і рядок у deadline, null виконавець, порядок перевірок, майбутня задача без виконавця, done з поганими даними, now, порожній список, назви як є, 10 задач, літній час); +3 мутації. 127 passed, мутації 35 з 35; «виконавець раніше за дедлайн» ловить 1, другий тест у блоці run.
- Блок run, 477e86f: +27 тестів (таймаут 500/20000 з deps, межа таймауту, 400/401/428/500, рядок замість помилки, падіння has/isStopped/add/count/stop, ключ о 00:30, чуже блокування, acquire падає, chat_id з UserRepo, спроби окремо на користувача, порядок skipped, невалідний now); faulty.ts +7 класів; +8 мутацій. 154 passed, мутації 43 з 43, жодну не ловить лише один тест.
- Блок mocks і errors, da5fa81: test/errors.test.ts (6), mocks.test.ts +17, run +1 (блокування іншого дня); check:headers зловив пропущену шапку errors.ts; +4 мутації. 180 passed, мутації 47 з 47, жодну не ловить лише один тест.
- Документація bdb87d4. Фінал: 180 passed (6 файлів), tsc 0, шапки ок, мутації 47 з 47, покриття рядки 99.52%, гілки 97.61%. Не запушено.
