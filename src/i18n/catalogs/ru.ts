import type { MessageKey } from "./en";

export const ru: Record<MessageKey, string> = {
  "start.hello": "Привет от LangBistro!",
  "start.setupHiccup": "Добро пожаловать в LangBistro! Не получилось настроить аккаунт, попробуй ещё раз.",
  "start.welcomeBack":
    "С возвращением! Готов практиковаться? Напиши сообщение или отправь голосовое, чтобы продолжить 🎙️",

  "onboarding.intro": `Привет! Я Bistro, твой ИИ-репетитор по языкам 🍽️

Я помогу развить живой разговорный навык с помощью:
- ежедневных чатов на языке, который ты учишь
- мгновенных исправлений и пояснений
- ежедневных слов
- голосовой практики 🎙️

Какой язык ты хочешь учить?`,
  "onboarding.unsupportedLanguage": "Этот язык не поддерживается. Выбери одну из кнопок выше.",
  "onboarding.dailyWordsWhen": "Отлично! Когда присылать слова дня?",
  "onboarding.levelAsk": "Отлично! Какой у тебя уровень {language}?",
  "onboarding.useButtons": "Сначала закончи настройку кнопками выше.",

  "button.read": "📖 Прочитать",
  "button.explain": "💡 Объяснить",
  "button.beginner": "🌱 Начальный",
  "button.intermediate": "📈 Средний",
  "button.advanced": "🎓 Продвинутый",
  "button.time0800": "🌅 8:00 (ET)",
  "button.time1100": "☀️ 11:00 (ET)",
  "button.time1400": "🌇 14:00 (ET)",
  "button.time1700": "🌆 17:00 (ET)",
  "button.time2000": "🌙 20:00 (ET)",
  "button.time2300": "🌃 23:00 (ET)",
  "button.subscribePro": "⚡ Оформить Pro",

  "settings.title": "⚙️ Настройки",
  "settings.levelLine": "📊 Уровень: {level}",
  "settings.levelAsk": "Какой у тебя уровень {language}?",
  "settings.timeAsk":
    "В какое время присылать слова дня? Время указано по восточному времени США (ET).",
  "settings.interfaceAsk": "На каком языке показывать меню, подсказки и пояснения?",
  "settings.interfaceUpdated": "✅ Язык интерфейса: {language}.",

  "language.ask": "Какой язык ты хочешь учить?",
  "interface.ask": "На каком языке показывать меню, подсказки и пояснения?",

  "command.start": "Начать или вернуться к Bistro",
  "command.language": "Выбрать язык для изучения",
  "command.interface": "Язык меню, подсказок и пояснений",
  "command.settings": "Уровень и время слов дня",
  "command.subscribe": "Подписка Pro",
  "command.done": "Завершить сегодняшнюю сессию",
  "language.switchedRestored":
    "✅ Переключено на {language}!\n\nПрогресс по {language} восстановлен (уровень: {level}, ярус {tier}).",
  "language.switchedFresh":
    "✅ Переключено на {language}!\n\nНачинаем с начального уровня, ярус 1.",

  "subscribe.alreadyPro":
    "✅ У тебя подписка Pro!\n\nЧтобы управлять подпиской или отменить её, напиши:\n📧 support@langbistro.com\n\nОтветим в течение 1 рабочего дня.",
  "subscribe.cta":
    "Выбери план и получи:\n\n✓ Безлимитные текстовые и голосовые сообщения\n✓ Все ярусы словаря\n✓ Более сильные модели ИИ\n\nНалоги считаются при оплате. Гарантия возврата 7 дней.",

  "account.suspended":
    "Аккаунт сейчас заблокирован. Напиши @langbistro_support, если считаешь, что это ошибка.",

  "quota.text":
    "Ты исчерпал бесплатный лимит текста на сегодня (10/день). Оформи подписку, чтобы практиковаться без ограничений.",
  "quota.voice":
    "Ты завершил сегодняшнюю сессию — Pro позволяет продолжать с голосом без ограничений.",

  "voice.processFailed": "Не получилось обработать это голосовое. Попробуй ещё раз.",
  "voice.downloadFailed": "Не получилось скачать это голосовое. Попробуй ещё раз.",

  "callback.textUnavailable": "Этот текст больше недоступен.",
  "callback.invalidWord": "Неверный выбор слова.",
  "callback.wordNotFound": "Слово не найдено.",
  "callback.audioFailed": "Не получилось создать аудио.",
  "callback.unsupportedLanguage": "Язык не поддерживается.",
  "callback.userNotFound": "Пользователь не найден.",
  "callback.profileNotFound": "Не получилось найти твой профиль.",
  "callback.switchFailed": "Не получилось сменить язык.",
  "callback.invalidTime": "Неверный выбор времени.",
  "callback.settingsUpdateFailed": "Сейчас не получилось обновить настройки. Попробуй ещё раз.",
  "callback.timeUpdated": "✅ Готово! Слова дня будут приходить в {time} по восточному времени.",
  "callback.levelUpdateFailed": "Не получилось обновить уровень.",
  "callback.levelUpdated": "Уровень обновлён: {level}!",
  "callback.actionUnavailable": "Это действие больше недоступно.",
  "callback.buttonExpired": "Эта кнопка устарела. Отправь новое сообщение, чтобы продолжить.",
  "callback.actionNotAvailable": "Это действие недоступно для данного сообщения.",
  "callback.interfaceUpdateFailed": "Не получилось обновить язык интерфейса.",

  "daily.wordsHeader": "📚 *Твои 10 слов на сегодня:*",
  "daily.fillBlank": 'Заполни пропуск:\n"{blanked}"\n(Ответь голосом или текстом!)',
  "daily.fillBlankFallback": "Дополни предложение, используя: {word}\n_____",

  "session.checklistHeader": "{used}/{total} слов использовано сегодня",
  "session.wrapUpHeader": "Сессия завершена — отличная работа.",
  "session.wrapUpWords": "Слов сегодня: {used}/{total}",
  "session.wrapUpWin": "Успех: ты правильно сказал(а) «{win}».",
  "session.wrapUpStreak": "Серия: {streak} дн.",
  "session.wrapUpTomorrowWord": "Завтра: попробуй вставить «{word}».",
  "session.wrapUpTomorrowFresh": "Завтра: ждёт новый набор слов.",
  "session.alreadyDone": "На сегодня ты уже закончил(а). До завтра.",
  "session.noSession": "Сегодня ещё нет набора слов — он придёт в твоё обычное время.",

  "review.ask":
    '🔁 Быстрое повторение! Как сказать «{translation}» на языке: {language}?\n(Ответь голосом или текстом!)',

  "quiz.correctExplain": '{praise} «{word}» значит «{translation}». {encouragement}',
  "quiz.wrongExplain": '{encouragement} Правильный ответ — «{word}», это значит «{translation}».',

  "moderation.banned":
    "Аккаунт заблокирован за повторные нарушения правил. Если считаешь, что это ошибка, напиши @langbistro_support.",
  "moderation.warning":
    "Внимание: эта тема ограничена. Держи чат безопасным и учебным, иначе аккаунт могут заблокировать.",
  "moderation.redirect":
    "Давай сосредоточимся на безопасной практике {language}. Предложи дружелюбную тему — и продолжим.",
  "moderation.safeTopic":
    "Давай перейдём на более безопасную тему и продолжим практиковать {language}. Спроси про путешествия, еду или повседневный разговор.",

  "nudge.explanation":
    "Я предложил ответить на языке {language} и напомнил, что ошибаться нормально.",

  "winback.hook":
    'Коротко: «{word}» значит «{translation}». Ответь чем угодно — и потренируемся вместе.',
  "winback.settings":
    "Хочешь сменить время слова дня или язык? Открой /settings — или просто напиши сообщение, и продолжим с того места.",
  "winback.final":
    "Перестану писать, чтобы не беспокоить. Когда захочешь снова взяться за {language}, отправь /start или любое сообщение — я буду здесь.",

  "target.es": "испанский",
  "target.fr": "французский",
  "target.en": "английский",

  "level.beginner": "Начальный",
  "level.intermediate": "Средний",
  "level.advanced": "Продвинутый",

  "milestone.50":
    "Отличная работа! Ты выучил первые 50 слов на языке {language} — уже понимаешь приветствия и простые фразы.",
  "milestone.100":
    "Поздравляю! 100 слов на языке {language} — уже можно представиться и понимать простые разговоры.",
  "milestone.250":
    "Супер! 250 слов на языке {language}. Теперь можно справиться с покупками, дорогой и светской беседой.",
  "milestone.500":
    "Потрясающе! 500 слов на языке {language} — ты строишь настоящий разговорный навык. Так держать!",
  "milestone.750":
    "Отлично! 750 слов на языке {language}. Уже можно выражать мнение и понимать большую часть повседневной речи.",
  "milestone.1000":
    "Фантастика! 1 000 слов на языке {language} — важный рубеж. Большинство разговоров уже по плечу.",
  "milestone.1500":
    "Впечатляет! 1 500 слов на языке {language}. Ты приближаешься к среднему уровню — продолжай!",
  "milestone.2000":
    "Потрясающе! 2 000 слов на языке {language}. Уже можно читать простые тексты и вести длинные разговоры.",
  "milestone.3000":
    "Выдающийся результат! 3 000 слов на языке {language} — ты уже в продвинутой зоне. Большая часть носительского контента доступна.",
  "milestone.4000":
    "Ты молодец! 4 000 слов на языке {language} освоены. Самая нужная лексика у тебя есть — так держать!",
};
