import type { MessageKey } from "./en";

export const pt: Record<MessageKey, string> = {
  "start.hello": "Olá do LangBistro!",
  "start.setupHiccup": "Bem-vindo ao LangBistro! Tivemos um problema na configuração. Tente de novo.",
  "start.welcomeBack":
    "Que bom te ver de novo! Pronto para praticar? Envie uma mensagem ou um áudio para continuar 🎙️",

  "onboarding.intro": `Oi! Eu sou o Bistro, seu tutor de idiomas com IA 🍽️

Vou te ajudar a desenvolver conversação de verdade com:
- Chats diários no seu idioma-alvo
- Correções e explicações na hora
- Palavras de vocabulário todos os dias
- Prática com voz 🎙️

Qual idioma você gostaria de aprender?`,
  "onboarding.unsupportedLanguage": "Idioma não suportado. Escolha um dos botões acima.",
  "onboarding.dailyWordsWhen": "Ótimo! Quando você quer receber as palavras do dia?",
  "onboarding.levelAsk": "Ótimo! Qual é o seu nível de {language}?",
  "onboarding.useButtons": "Use os botões acima para terminar a configuração primeiro.",

  "button.read": "📖 Ler",
  "button.explain": "💡 Explicar",
  "button.beginner": "🌱 Iniciante",
  "button.intermediate": "📈 Intermediário",
  "button.advanced": "🎓 Avançado",
  "button.time0800": "🌅 8:00 (ET)",
  "button.time1100": "☀️ 11:00 (ET)",
  "button.time1400": "🌇 14:00 (ET)",
  "button.time1700": "🌆 17:00 (ET)",
  "button.time2000": "🌙 20:00 (ET)",
  "button.time2300": "🌃 23:00 (ET)",
  "button.subscribePro": "⚡ Assinar o Pro",

  "settings.title": "⚙️ Configurações",
  "settings.levelLine": "📊 Nível: {level}",
  "settings.levelAsk": "Qual é o seu nível de {language}?",
  "settings.timeAsk":
    "A que horas você quer receber as palavras do dia? Os horários estão no horário do Leste (ET).",
  "settings.interfaceAsk": "Em que idioma os menus, as dicas e as explicações devem aparecer?",
  "settings.interfaceUpdated": "✅ Idioma da interface definido para {language}.",

  "language.ask": "Qual idioma você gostaria de aprender?",
  "interface.ask": "Em que idioma os menus, as dicas e as explicações devem aparecer?",

  "command.start": "Começar ou voltar ao Bistro",
  "command.language": "Escolher o idioma para aprender",
  "command.interface": "Idioma dos menus, dicas e explicações",
  "command.settings": "Nível e horário das palavras do dia",
  "command.subscribe": "Assinar o Pro",
  "command.done": "Encerrar a sessão de hoje",
  "language.switchedRestored":
    "✅ Você mudou para {language}!\n\nSeu progresso de {language} foi restaurado (Nível: {level}, faixa {tier}).",
  "language.switchedFresh":
    "✅ Você mudou para {language}!\n\nComeçando do zero no Iniciante, faixa 1.",

  "subscribe.alreadyPro":
    "✅ Você já é assinante Pro!\n\nPara gerenciar ou cancelar a assinatura, envie um e-mail para:\n📧 support@langbistro.com\n\nVamos te ajudar em 1 dia útil.",
  "subscribe.cta":
    "Escolha seu plano e desbloqueie:\n\n✓ Mensagens de texto e voz ilimitadas\n✓ Todas as faixas de vocabulário\n✓ Modelos de IA mais capazes\n\nImpostos calculados no checkout. Garantia de reembolso de 7 dias.",

  "account.suspended":
    "Sua conta está suspensa. Fale com @langbistro_support se achar que isso é um engano.",

  "quota.text":
    "Você atingiu o limite gratuito de texto de hoje (10/dia). Faça upgrade para praticar sem limites.",
  "quota.voice":
    "Você terminou a sessão de hoje — o Pro deixa você continuar com voz ilimitada.",

  "voice.processFailed": "Não consegui processar essa mensagem de voz. Tente de novo.",
  "voice.downloadFailed": "Não consegui baixar essa mensagem de voz. Tente de novo.",

  "callback.textUnavailable": "Este texto não está mais disponível.",
  "callback.invalidWord": "Seleção de palavra inválida.",
  "callback.wordNotFound": "Palavra não encontrada.",
  "callback.audioFailed": "Não foi possível gerar o áudio.",
  "callback.unsupportedLanguage": "Idioma não suportado.",
  "callback.userNotFound": "Usuário não encontrado.",
  "callback.profileNotFound": "Não foi possível encontrar seu perfil.",
  "callback.switchFailed": "Não foi possível mudar o idioma.",
  "callback.invalidTime": "Seleção de horário inválida.",
  "callback.settingsUpdateFailed": "Não consegui atualizar suas configurações agora. Tente de novo.",
  "callback.timeUpdated": "✅ Combinado! Você vai receber as palavras do dia às {time} no horário do Leste.",
  "callback.levelUpdateFailed": "Não foi possível atualizar o nível.",
  "callback.levelUpdated": "Nível atualizado para {level}!",
  "callback.actionUnavailable": "Esta ação não está mais disponível.",
  "callback.buttonExpired": "Esse botão expirou. Envie uma nova mensagem para continuar.",
  "callback.actionNotAvailable": "Essa ação não está disponível para esta mensagem.",
  "callback.interfaceUpdateFailed": "Não foi possível atualizar o idioma da interface.",

  "daily.wordsHeader": "📚 *Suas 10 palavras de hoje:*",
  "daily.fillBlank": 'Preencha a lacuna:\n"{blanked}"\n(Responda por voz ou texto!)',
  "daily.fillBlankFallback": "Complete esta frase usando: {word}\n_____",

  "session.checklistHeader": "{used}/{total} palavras usadas hoje",
  "session.wrapUpHeader": "Sessão completa — bom trabalho.",
  "session.wrapUpWords": "Palavras usadas hoje: {used}/{total}",
  "session.wrapUpWin": "Vitória: você acertou “{win}”.",
  "session.wrapUpStreak": "Sequência: {streak} dia(s)",
  "session.wrapUpTomorrowWord": "Amanhã: tente usar “{word}”.",
  "session.wrapUpTomorrowFresh": "Amanhã: um novo conjunto de palavras te espera.",
  "session.alreadyDone": "Você já terminou por hoje. Até amanhã.",
  "session.noSession": "Ainda não há palavras hoje — elas chegam no seu horário habitual.",

  "review.ask":
    '🔁 Revisão rápida! Como se diz "{translation}" em {language}?\n(Responda por voz ou texto!)',

  "quiz.correctExplain": '{praise} "{word}" significa "{translation}". {encouragement}',
  "quiz.wrongExplain": '{encouragement} A resposta certa era "{word}" — significa "{translation}".',

  "moderation.banned":
    "Sua conta foi suspensa por violações repetidas das regras. Se achar que isso é um engano, fale com @langbistro_support.",
  "moderation.warning":
    "Aviso: este assunto é restrito. Mantenha o chat seguro e focado no aprendizado, ou sua conta pode ser suspensa.",
  "moderation.redirect":
    "Vamos manter o foco em praticar {language} com segurança. Tente um assunto amigável e seguimos.",
  "moderation.safeTopic":
    "Vamos mudar para um assunto mais seguro e continuar praticando {language}. Pergunte sobre viagem, comida ou conversa do dia a dia.",

  "nudge.explanation":
    "Eu te incentivei a responder em {language} e disse que errar faz parte.",

  "winback.hook":
    'Rápido: "{word}" significa "{translation}". Manda qualquer resposta e praticamos juntos.',
  "winback.settings":
    "Quer mudar o horário da palavra do dia ou o idioma? Abra /settings — ou envie uma mensagem e seguimos de onde paramos.",
  "winback.final":
    "Vou parar de enviar mensagens para não te incomodar. Quando quiser retomar {language}, envie /start ou qualquer mensagem — eu estarei aqui.",

  "target.es": "espanhol",
  "target.fr": "francês",
  "target.en": "inglês",

  "level.beginner": "Iniciante",
  "level.intermediate": "Intermediário",
  "level.advanced": "Avançado",

  "milestone.50":
    "Muito bem! Você aprendeu suas primeiras 50 palavras de {language} — já dá para entender cumprimentos e frases do dia a dia!",
  "milestone.100":
    "Parabéns! 100 palavras de {language} — você já consegue se apresentar e entender conversas simples!",
  "milestone.250":
    "Ótimo trabalho! 250 palavras de {language}. Agora você consegue lidar com compras básicas, direções e conversa informal!",
  "milestone.500":
    "Incrível! 500 palavras de {language} — você está construindo conversação de verdade. Continue!",
  "milestone.750":
    "Excelente! 750 palavras de {language}. Agora você consegue expressar opiniões e entender a maior parte do {language} cotidiano!",
  "milestone.1000":
    "Fantástico! 1.000 palavras de {language} — você passou de um marco importante. A maioria das conversas está ao seu alcance!",
  "milestone.1500":
    "Impressionante! 1.500 palavras de {language}. Você está se aproximando da fluência intermediária — continua!",
  "milestone.2000":
    "Incrível! 2.000 palavras de {language}. Você já consegue ler textos simples e manter conversas mais longas!",
  "milestone.3000":
    "Extraordinário! 3.000 palavras de {language} — você já está em território avançado. A maior parte do conteúdo nativo está acessível!",
  "milestone.4000":
    "Você é incrível! 4.000 palavras de {language} no domínio. Você é fluente no vocabulário mais essencial — muito bem!",
};
