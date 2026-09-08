import type { MessageKey } from "./en";

export const es: Record<MessageKey, string> = {
  "start.hello": "¡Hola desde LangBistro!",
  "start.setupHiccup": "¡Bienvenido a LangBistro! Hubo un problema al configurar. Inténtalo de nuevo.",
  "start.welcomeBack":
    "¡Qué bueno verte de nuevo! ¿Listo para practicar? Envíame un mensaje o una nota de voz para continuar 🎙️",

  "onboarding.intro": `¡Hola! Soy Bistro, tu tutor de idiomas con IA 🍽️

Te ayudo a desarrollar habilidades reales de conversación con:
- Chats diarios en tu idioma objetivo
- Correcciones y explicaciones al instante
- Palabras de vocabulario todos los días
- Práctica con voz 🎙️

¿Qué idioma te gustaría aprender?`,
  "onboarding.unsupportedLanguage": "Idioma no compatible. Elige uno de los botones de arriba.",
  "onboarding.dailyWordsWhen": "¡Genial! ¿Cuándo quieres recibir tus palabras del día?",
  "onboarding.levelAsk": "¡Genial! ¿Cuál es tu nivel de {language}?",
  "onboarding.useButtons": "Usa los botones de arriba para terminar la configuración primero.",

  "button.read": "📖 Leer",
  "button.explain": "💡 Explicar",
  "button.beginner": "🌱 Principiante",
  "button.intermediate": "📈 Intermedio",
  "button.advanced": "🎓 Avanzado",
  "button.time0800": "🌅 8:00 a. m. (ET)",
  "button.time1100": "☀️ 11:00 a. m. (ET)",
  "button.time1400": "🌇 2:00 p. m. (ET)",
  "button.time1700": "🌆 5:00 p. m. (ET)",
  "button.time2000": "🌙 8:00 p. m. (ET)",
  "button.time2300": "🌃 11:00 p. m. (ET)",
  "button.subscribePro": "⚡ Suscribirse a Pro",

  "settings.title": "⚙️ Ajustes",
  "settings.levelLine": "📊 Nivel: {level}",
  "settings.levelAsk": "¿Cuál es tu nivel de {language}?",
  "settings.timeAsk":
    "¿A qué hora quieres recibir tus palabras del día? Las horas están en hora del Este (ET).",
  "settings.interfaceAsk": "¿En qué idioma deben estar los menús, las pistas y las explicaciones?",
  "settings.interfaceUpdated": "✅ Idioma de la interfaz: {language}.",

  "language.ask": "¿Qué idioma te gustaría aprender?",
  "interface.ask": "¿En qué idioma deben estar los menús, las pistas y las explicaciones?",

  "command.start": "Empezar o volver a Bistro",
  "command.language": "Elegir el idioma que quieres aprender",
  "command.interface": "Idioma de menús, pistas y explicaciones",
  "command.settings": "Nivel y hora de las palabras del día",
  "command.subscribe": "Suscribirse a Pro",
  "command.done": "Terminar la sesión de hoy",
  "language.switchedRestored":
    "✅ Cambiaste a {language}.\n\nSe restauró tu progreso de {language} (Nivel: {level}, nivel de vocabulario {tier}).",
  "language.switchedFresh":
    "✅ Cambiaste a {language}.\n\nEmpiezas de cero en Principiante, nivel de vocabulario 1.",

  "subscribe.alreadyPro":
    "✅ Ya eres suscriptor Pro.\n\nPara gestionar o cancelar la suscripción, escríbenos a:\n📧 support@langbistro.com\n\nTe ayudamos en 1 día hábil.",
  "subscribe.cta":
    "Elige tu plan y desbloquea:\n\n✓ Mensajes de texto y voz ilimitados\n✓ Todos los niveles de vocabulario\n✓ Modelos de IA más capaces\n\nLos impuestos se calculan al pagar. Garantía de reembolso de 7 días.",

  "account.suspended":
    "Tu cuenta está suspendida. Contacta a @langbistro_support si crees que es un error.",

  "quota.text":
    "Llegaste al límite gratuito de texto de hoy (10/día). Mejora tu plan para practicar sin límites.",
  "quota.voice":
    "Terminaste la sesión de hoy — Pro te deja seguir practicando con voz ilimitada.",

  "voice.processFailed": "No pude procesar ese mensaje de voz. Inténtalo de nuevo.",
  "voice.downloadFailed": "No pude descargar ese mensaje de voz. Inténtalo de nuevo.",

  "callback.textUnavailable": "Este texto ya no está disponible.",
  "callback.invalidWord": "Selección de palabra no válida.",
  "callback.wordNotFound": "No se encontró la palabra.",
  "callback.audioFailed": "No se pudo generar el audio.",
  "callback.unsupportedLanguage": "Idioma no compatible.",
  "callback.userNotFound": "No se encontró el usuario.",
  "callback.profileNotFound": "No se pudo encontrar tu perfil.",
  "callback.switchFailed": "No se pudo cambiar el idioma.",
  "callback.invalidTime": "Selección de hora no válida.",
  "callback.settingsUpdateFailed": "No pude actualizar tus ajustes ahora. Inténtalo de nuevo.",
  "callback.timeUpdated": "✅ Listo. Recibirás tus palabras del día a las {time} (hora del Este).",
  "callback.levelUpdateFailed": "No se pudo actualizar el nivel.",
  "callback.levelUpdated": "Nivel actualizado a {level}.",
  "callback.actionUnavailable": "Esta acción ya no está disponible.",
  "callback.buttonExpired": "Ese botón ya caducó. Envía un mensaje nuevo para continuar.",
  "callback.actionNotAvailable": "Esa acción no está disponible para este mensaje.",
  "callback.interfaceUpdateFailed": "No se pudo actualizar el idioma de la interfaz.",

  "daily.wordsHeader": "📚 *Tus 10 palabras de hoy:*",
  "daily.fillBlank": 'Completa el espacio:\n"{blanked}"\n(Responde por voz o texto)',
  "daily.fillBlankFallback": "Completa esta oración usando: {word}\n_____",

  "session.checklistHeader": "{used}/{total} palabras usadas hoy",
  "session.wrapUpHeader": "Sesión completa — buen trabajo.",
  "session.wrapUpWords": "Palabras usadas hoy: {used}/{total}",
  "session.wrapUpWin": "Logro: acertaste “{win}”.",
  "session.wrapUpStreak": "Racha: {streak} día(s)",
  "session.wrapUpTomorrowWord": "Mañana: intenta usar “{word}”.",
  "session.wrapUpTomorrowFresh": "Mañana: te espera un set nuevo de palabras.",
  "session.alreadyDone": "Ya terminaste por hoy. Hasta mañana.",
  "session.noSession": "Aún no hay set de palabras hoy — llegará a tu hora habitual.",

  "review.ask":
    '🔁 ¡Repaso rápido! ¿Cómo se dice "{translation}" en {language}?\n(Responde por voz o texto)',

  "quiz.correctExplain": '{praise} "{word}" significa "{translation}". {encouragement}',
  "quiz.wrongExplain": '{encouragement} La respuesta correcta era "{word}" — significa "{translation}".',

  "correction.invite": "Casi — *{phrase}*\\. ¿Lo dices otra vez\\?",
  "correction.reattemptAck": "¡Bien — lo dijiste!",

  "moderation.banned":
    "Tu cuenta fue suspendida por violaciones repetidas de las normas. Si crees que es un error, contacta a @langbistro_support.",
  "moderation.warning":
    "Aviso: este tema está restringido. Mantén el chat seguro y centrado en el aprendizaje, o tu cuenta podría suspenderse.",
  "moderation.redirect":
    "Mantengamos el enfoque en practicar {language} de forma segura. Prueba un tema amistoso y seguimos.",
  "moderation.safeTopic":
    "Cambiemos a un tema más seguro y sigamos practicando {language}. Pregunta sobre viajes, comida o conversación cotidiana.",

  "nudge.explanation":
    "Te animé a responder en {language} y te dije que está bien cometer errores.",

  "winback.hook":
    'Rápido: "{word}" significa "{translation}". Responde con lo que sea y practicamos juntos.',
  "winback.settings":
    "¿Quieres cambiar la hora de la palabra del día o el idioma? Abre /settings — o envía un mensaje y seguimos donde lo dejamos.",
  "winback.final":
    "Dejaré de escribirte para no molestarte. Cuando quieras retomar {language}, envía /start o cualquier mensaje — aquí estaré.",

  "target.es": "español",
  "target.fr": "francés",
  "target.en": "inglés",

  "level.beginner": "Principiante",
  "level.intermediate": "Intermedio",
  "level.advanced": "Avanzado",

  "milestone.50":
    "¡Buen trabajo! Aprendiste tus primeras 50 palabras de {language} — ya puedes entender saludos y frases cotidianas.",
  "milestone.100":
    "¡Felicidades! 100 palabras de {language} — ya puedes presentarte y entender conversaciones simples.",
  "milestone.250":
    "¡Excelente! 250 palabras de {language}. Ya puedes manejar compras básicas, direcciones y charla informal.",
  "milestone.500":
    "¡Increíble! 500 palabras de {language} — estás construyendo una habilidad conversacional real. ¡Sigue así!",
  "milestone.750":
    "¡Excelente! 750 palabras de {language}. Ya puedes expresar opiniones y entender la mayor parte del {language} cotidiano.",
  "milestone.1000":
    "¡Fantástico! 1,000 palabras de {language} — cruzaste un hito importante. La mayoría de las conversaciones están a tu alcance.",
  "milestone.1500":
    "¡Impresionante! 1,500 palabras de {language}. Te acercas a una fluidez intermedia — ¡sigue!",
  "milestone.2000":
    "¡Increíble! 2,000 palabras de {language}. Ya puedes leer textos simples y mantener conversaciones más largas.",
  "milestone.3000":
    "¡Extraordinario! 3,000 palabras de {language} — ya estás en territorio avanzado. La mayor parte del contenido nativo es accesible.",
  "milestone.4000":
    "¡Eres increíble! Dominaste 4,000 palabras de {language}. Manejas el vocabulario más esencial — ¡muy bien!",
};
