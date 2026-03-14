// core/onboardingEngine.js
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

  if (!data.businessName.extracted) {
    const patterns = [
      /(?:chamo|sou|empresa|negócio|meu negócio|minha empresa|nome é|se chama|chamamos)\s+(?:de\s+)?([A-ZÀ-Ú][a-zA-ZÀ-ú\s&]+)/i,
      /([A-ZÀ-Ú][a-zA-ZÀ-ú\s&]{2,30})(?:\s+é meu|\s+é minha|\s+é nossa)/i
    ];
    let matched = false;
    for (const p of patterns) {
      const m = message.match(p);
      if (m) {
        data.businessName = { ...data.businessName, extracted: true, value: m[1].trim() };
        matched = true;
        break;
      }
    }
    if (!matched && message.trim().length >= 3) {
      const words = message.trim().split(/\s+/);
      const hasRealWord = words.some(w => w.length >= 3 && !/^[^aeiouáéíóuàâêôãõ]{4,}$/i.test(w));
      if (hasRealWord) {
        data.businessName = { ...data.businessName, extracted: true, value: message.trim() };
      }
    }
  }

  if (!data.product.extracted) {
    const patterns = [
      /(?:vendo|vendemos|ofereço|trabalhamos com|faço|fazemos|prestamos|serviço de|produto é|produtos são)\s+(.{5,80}?)(?:\.|,|!|\?|$)/i,
      /(?:meu produto|nosso produto|meu serviço|nosso serviço)\s+(?:é|são)\s+(.{5,80}?)(?:\.|,|!|\?|$)/i
    ];
    let matched = false;
    for (const p of patterns) {
      const m = message.match(p);
      if (m) {
        data.product = { ...data.product, extracted: true, value: m[1].trim() };
        matched = true;
        break;
      }
    }
    if (!matched && message.trim().length >= 8) {
      const words = message.trim().split(/\s+/);
      const hasRealWords = words.some(w => w.length >= 4);
      if (hasRealWords) {
        data.product = { ...data.product, extracted: true, value: message.trim() };
      }
    }
  }

  if (!data.price.extracted) {
    const allPrices = [];
    const priceMatches = [...message.matchAll(/R\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?)/gi)];
    for (const m of priceMatches) {
      const raw = (m[1] || m[2]).replace(/\./g, '').replace(',', '.');
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 10) allPrices.push(num);
    }
    if (allPrices.length > 0) {
      const min = Math.min(...allPrices);
      const max = Math.max(...allPrices);
      const valueStr = min === max ? `${min}` : `${min} a ${max}`;
      data.price = { ...data.price, extracted: true, value: valueStr };
    } else {
      const numbers = [...(message.matchAll(/\d+/g))].map(m => parseInt(m[0])).filter(n => n > 10);
      if (numbers.length > 0) {
        data.price = { ...data.price, extracted: true, value: `${Math.max(...numbers)}` };
      }
    }
  }

  if (!data.audience.extracted) {
    const audiencePattern = /(?:público|público-alvo|clientes?|meu público|nosso público|atendo|atendemos|foco|voltado|para quem|ideal para|clientes ideais?|persona)\b.{0,100}?(?:são|é|:|\,)?\s*(.{5,100}?)(?:\.|$|!|\?|\n)/i;
    const m = message.match(audiencePattern);
    if (m && m[1] && m[1].trim().length > 5) {
      data.audience = { ...data.audience, extracted: true, value: m[1].trim() };
    } else if (message.trim().length > 10 && data.price.extracted && !data.product.value?.toLowerCase().includes(message.toLowerCase().substring(0, 10))) {
      data.audience = { ...data.audience, extracted: true, value: message.trim() };
    }
  }

  if (!data.differentials.extracted) {
    const diffPattern = /(?:diferencial|diferenciais|diferente|destaque|especial|único|melhor|vantagem|benefício|o que nos diferencia|vantagens?|por que escolher|diferencia[íi]s)\b[^.?!]{0,200}?(?:é|são|que|é que)\s+(.+?)(?:\.|$|!|\?|\n|$)/i;
    const m = message.match(diffPattern);
    if (m && m[1] && m[1].trim().length > 5) {
      data.differentials = { ...data.differentials, extracted: true, value: m[1].trim() };
    }
  }

  if (!data.whatsapp.extracted) {
    const cleaned = message.replace(/\s+/g, '');
    const m = cleaned.match(/(?:\+?55)?(?:\(?\d{2}\)?)?\d{4,5}[-]?\d{4}/);
    if (m) {
      data.whatsapp = { ...data.whatsapp, extracted: true, value: m[0] };
    }
  }

  return data;
}

function getMissingFields(data) {
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

Está tudo certo? Se sim, já configuro tua Kira! 🚀`;
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
  return `Você é Kira, consultora especialista em ${data.product.value}.
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