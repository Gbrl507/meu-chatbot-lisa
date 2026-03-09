// core/onboardingEngine.js
// Lisa extrai dados do negócio conversando naturalmente

const ONBOARDING_FIELDS = {
  businessName: { label: 'nome do negócio', extracted: false, value: null },
  product: { label: 'produto ou serviço', extracted: false, value: null },
  price: { label: 'preço ou valor', extracted: false, value: null },
  audience: { label: 'público-alvo', extracted: false, value: null },
  differentials: { label: 'diferenciais', extracted: false, value: null },
  whatsapp: { label: 'WhatsApp', extracted: false, value: null }
};

function detectOnboardingData(message, currentData) {
  const msg = message.toLowerCase();
  const data = { ...currentData };

  // Nome do negócio
  if (!data.businessName.extracted) {
    const patterns = [
      /(?:chamo|sou|empresa|negócio|meu negócio|minha empresa|nome é|se chama|chamamos)\s+(?:de\s+)?([A-ZÀ-Ú][a-zA-ZÀ-ú\s&]+)/i,
      /([A-ZÀ-Ú][a-zA-ZÀ-ú\s&]{2,30})(?:\s+é meu|\s+é minha|\s+é nossa)/i
    ];
    for (const p of patterns) {
      const m = message.match(p);
      if (m) { data.businessName = { ...data.businessName, extracted: true, value: m[1].trim() }; break; }
    }
  }

  // Produto/serviço
  if (!data.product.extracted) {
    const patterns = [
      /(?:vendo|vendemos|ofereço|trabalhamos com|faço|fazemos|prestamos|serviço de|produto é|produtos são)\s+(.{5,80}?)(?:\.|,|!|\?|$)/i,
      /(?:meu produto|nosso produto|meu serviço|nosso serviço)\s+(?:é|são)\s+(.{5,80}?)(?:\.|,|!|\?|$)/i
    ];
    for (const p of patterns) {
      const m = message.match(p);
      if (m) { data.product = { ...data.product, extracted: true, value: m[1].trim() }; break; }
    }
  }

  // Preço
  if (!data.price.extracted) {
    const patterns = [
      /(?:r\$|reais|custa|valor|preço|investimento|mensalidade|parcela)\s*(?:de\s*)?(\d+[\.,]?\d*(?:\s*(?:mil|k|reais))?)/i,
      /(\d+[\.,]?\d*)\s*(?:reais|r\$|mil|k)/i
    ];
    for (const p of patterns) {
      const m = message.match(p);
      if (m) { data.price = { ...data.price, extracted: true, value: m[1].trim() }; break; }
    }
  }

  // Público-alvo
  if (!data.audience.extracted) {
    const patterns = [
      /(?:meu público|nosso público|atendo|atendemos|clientes são|cliente ideal|foco em|voltado para|para\s+(?:pessoas|quem|mulheres|homens|empresas|donos|profissionais))\s+(.{5,100}?)(?:\.|,|!|\?|$)/i
    ];
    for (const p of patterns) {
      const m = message.match(p);
      if (m) { data.audience = { ...data.audience, extracted: true, value: m[1].trim() }; break; }
    }
  }

  // Diferencial
  if (!data.differentials.extracted) {
    const patterns = [
      /(?:diferencial|diferente|destaque|especial|único|melhor|vantagem|benefício)\s+(?:é|são|que)\s+(.{5,100}?)(?:\.|,|!|\?|$)/i
    ];
    for (const p of patterns) {
      const m = message.match(p);
      if (m) { data.differentials = { ...data.differentials, extracted: true, value: m[1].trim() }; break; }
    }
  }

  // WhatsApp
  if (!data.whatsapp.extracted) {
    const m = message.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/);
    if (m) { data.whatsapp = { ...data.whatsapp, extracted: true, value: m[0].trim() }; }
  }

  return data;
}

function getMissingFields(data) {
  // whatsapp e differentials são opcionais — só exige os essenciais
  const required = ['businessName', 'product', 'price', 'audience'];
  return required.filter(k => !data[k].extracted);
}

function getNextQuestion(missingFields) {
  const questions = {
    businessName: "Qual é o nome do seu negócio?",
    product: "O que você vende? Me conta sobre seu produto ou serviço.",
    price: "Qual é o valor ou preço do que você oferece?",
    audience: "Quem é seu cliente ideal? Para quem você vende?",
    differentials: "O que diferencia você da concorrência?",
    whatsapp: "Qual é o WhatsApp para contato?"
  };
  return questions[missingFields[0]];
}

function generateSummary(data) {
  return `Perfeito! Deixa eu confirmar o que entendi:

🏢 Negócio: ${data.businessName.value || 'não informado'}
📦 Produto/Serviço: ${data.product.value || 'não informado'}
💰 Valor: R$ ${data.price.value || 'não informado'}
🎯 Público: ${data.audience.value || 'não informado'}
${data.differentials.value ? `⭐ Diferencial: ${data.differentials.value}` : ''}
${data.whatsapp.value ? `📱 WhatsApp: ${data.whatsapp.value}` : ''}

Está tudo certo? Se sim, já configuro tua Lisa! 🚀`;
}

function generateSlug(businessName) {
  return businessName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 40) + '-' + Date.now().toString().slice(-4);
}

function generateSystemPrompt(data) {
  return `Você é Lisa, consultora especialista em ${data.product.value}. 
Você trabalha para ${data.businessName.value}.
Seu objetivo é converter leads em clientes com neuropsicologia aplicada.
Produto: ${data.product.value}
Valor: R$ ${data.price.value}
Público-alvo: ${data.audience.value}
${data.differentials.value ? `Diferencial: ${data.differentials.value}` : ''}
Sempre foque em entender a dor do cliente e conectar ao produto.`;
}

module.exports = {
  ONBOARDING_FIELDS,
  detectOnboardingData,
  getMissingFields,
  getNextQuestion,
  generateSummary,
  generateSlug,
  generateSystemPrompt
};
