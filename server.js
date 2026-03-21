const cors = require('cors');
const nocache = require('nocache');
require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');

const scoringEngine = require('./core/scoringEngine.js');
const memoryEngine = require('./core/memoryEngine.js');
const stateDetector = require('./core/stateDetector.js');
const promptComposer = require('./core/promptComposer.js');
const silence = require('./core/silence.js');
const strategyEngine = require('./core/strategyEngine.js');
const scrapeWebsite = require('./core/webScraper.js');
const Tenant = require('./models/Tenant');
const {
  ONBOARDING_FIELDS,
  detectOnboardingData,
  getMissingFields,
  getNextQuestion,
  generateSummary,
  generateSlug,
  generateSystemPrompt
} = require('./core/onboardingEngine.js');

const onboardingSessions = {};

console.log('TIPO DO SCRAPER:', typeof scrapeWebsite);

const GROQ_KEY = process.env.GROQ_API_KEY;
const DB = 'mongodb+srv://luisgabriel5073234_db_user:AecOennqe8JgBVVz@cluster0.1ya69kg.mongodb.net/lisa_db?retryWrites=true&w=majority';
const PORT = process.env.PORT || 3000;

mongoose.connect(DB)
  .then(() => console.log("✅ Banco Conectado!"))
  .catch(err => console.error("❌ MongoDB:", err));

const app = express();
app.use(express.json());
app.use(cors());
app.use(nocache());

app.get('/configurar', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
  html = html.replace("const IS_ONBOARDING = window.location.pathname.includes('configurar');", 'const IS_ONBOARDING = true;');
  res.send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: GROQ_KEY });
const MEMORY_FILE = path.join(__dirname, 'user_memory.json');
const HISTORY_FILE = path.join(__dirname, 'user_histories.json');
let userMemory = {};
const userHistories = {};

function loadLocalData() {
  try {
    if (fs.existsSync(MEMORY_FILE)) userMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    if (fs.existsSync(HISTORY_FILE)) Object.assign(userHistories, JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')));
  } catch (e) { console.error("Erro JSONs:", e); }
}
loadLocalData();

function saveLocalData() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(userMemory, null, 2));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(userHistories, null, 2));
}

function pushToHistory(userId, role, content) {
  if (!userHistories[userId]) userHistories[userId] = [];
  userHistories[userId].push({ role, content });
  if (userHistories[userId].length > 20) userHistories[userId] = userHistories[userId].slice(-20);
  saveLocalData();
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
app.post('/onboarding', async (req, res) => {
  const { userId = 'anon', message } = req.body;
  if (!message) return res.status(400).json({ error: 'Falta mensagem.' });
  try {
    // Ignora mensagem de init — força nova sessão
    if (message === '__init__') {
      delete onboardingSessions[userId];
    }
    if (!onboardingSessions[userId]) {
      onboardingSessions[userId] = {
        data: JSON.parse(JSON.stringify(ONBOARDING_FIELDS)),
        step: 'collecting',
        awaitingConfirmation: false
      };
      // Gera resposta natural via Groq
const onboardingChat = await groq.chat.completions.create({
  model: 'llama-3.3-70b-versatile',
  messages: [{
    role: 'system',
    content: `Você é Kira — uma IA de vendas calorosa e brasileira.
Está a configurar o negócio de um novo cliente.

DADOS JÁ RECOLHIDOS:
${JSON.stringify(session.data, null, 2)}

CAMPOS QUE FALTAM: ${missing.join(', ')}

MISSÃO: Conversar naturalmente para descobrir os campos em falta.
→ Fala como brasileira — calorosa, directa, com gírias
→ UMA pergunta de cada vez
→ Aceita qualquer forma de resposta
→ Nunca peças para repetir — adapta-te ao que disseram
→ Se disseram o nome pessoal sem negócio — pergunta sobre o negócio de forma natural
→ Exemplo: "Boa Luis! E o negócio? Como se chama sua empresa ou consultório?"`
  }, 
  ...session.history || [],
  { role: 'user', content: message }],
  temperature: 0.7
});

const reply = onboardingChat?.choices?.[0]?.message?.content;
if (!session.history) session.history = [];
session.history.push({ role: 'user', content: message });
session.history.push({ role: 'assistant', content: reply });
    }
    const session = onboardingSessions[userId];
    if (session.awaitingConfirmation) {
      const msg = message.toLowerCase();
      const confirmed = ['sim','yes','correto','certo','perfeito','isso','exato','ok','pode','confirmo'].some(w => msg.includes(w));
      const denied = ['não','nao','errado','corrige','muda','alterar'].some(w => msg.includes(w));
      if (confirmed) {
        const data = session.data;
        const slug = generateSlug(data.businessName.value);
        const novoTenant = new Tenant({
          slug, name: data.businessName.value, nicho: data.product.value,
          systemPromptBase: generateSystemPrompt(data),
          trainingData: `Negócio: ${data.businessName.value}\nProduto: ${data.product.value}\nValor: R$ ${data.price.value}\nPúblico: ${data.audience.value}`,
          contactInfo: { whatsapp: data.whatsapp.value || '' },
          ownerUserId: userId
        });
        await novoTenant.save();
        if (!global.ownerSessions) global.ownerSessions = {};
        global.ownerSessions[userId] = {
          slug,
          name: data.businessName.value,
          isOwner: true
        };
        delete onboardingSessions[userId];
      return res.json({ ok: true, reply: `✅ Prontinho! 🚀\n\nEaê! Tudo configurado — sou a Kira e já sei tudo sobre o ${data.businessName.value}!\n\n🔗 Link dos seus clientes:\nhttps://meu-chatbot-lisa.onrender.com/?tenant=${slug}\n\nAí, como posso te chamar? 😊`, step: 'complete', tenant: { slug, name: data.businessName.value } });
      } else if (denied) {
        session.awaitingConfirmation = false;
        return res.json({ ok: true, reply: "Tudo bem! O que precisa corrigir?", step: 'collecting' });
      } else {
        return res.json({ ok: true, reply: "Confirma os dados? É só dizer sim ou me fala o que corrigir.", step: 'awaiting_confirmation' });
      }
    }

    // Extracção inteligente via Groq — entende qualquer forma de escrita
try {
  const extraction = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'system',
      content: `Você é um extractor de dados de negócio. 
Analise a mensagem e extraia informações de negócio.
Responda APENAS em JSON válido sem markdown:
{
  "businessName": "nome do negócio ou null",
  "product": "produto ou serviço ou null",
  "price": "preço ou valor ou null",
  "audience": "público-alvo ou null"
}
Regras:
- Se não houver informação para um campo coloque null
- Não invente dados que não estão na mensagem
- businessName: nome da empresa/negócio/clínica/escritório
- product: o que vende ou faz — serviço ou produto
- price: qualquer menção de valor, preço, honorário
- audience: para quem vende, público, pacientes, clientes`
    }, {
      role: 'user',
      content: message
    }],
    temperature: 0
  });

  const raw = extraction?.choices?.[0]?.message?.content || '{}';
  const clean = raw.replace(/```json|```/g, '').trim();
  const extracted = JSON.parse(clean);

  if (extracted.businessName && !session.data.businessName.extracted) {
    session.data.businessName = { ...session.data.businessName, extracted: true, value: extracted.businessName };
  }
  if (extracted.product && !session.data.product.extracted) {
    session.data.product = { ...session.data.product, extracted: true, value: extracted.product };
  }
  if (extracted.price && !session.data.price.extracted) {
    session.data.price = { ...session.data.price, extracted: true, value: extracted.price };
  }
  if (extracted.audience && !session.data.audience.extracted) {
    session.data.audience = { ...session.data.audience, extracted: true, value: extracted.audience };
  }
} catch(e) {
  // Fallback para regex se Groq falhar
  session.data = detectOnboardingData(message, session.data);
}

const missing = getMissingFields(session.data);
const progress = Math.round(((4 - missing.length) / 4) * 100);
if (missing.length === 0) {
  session.awaitingConfirmation = true;
  return res.json({ ok: true, reply: generateSummary(session.data), step: 'awaiting_confirmation', progress: 100 });
}
    const confirmations = ['Anotado!','Perfeito!','Ótimo!','Entendi!'];
    const totalExtracted = Object.values(session.data).filter(f => f.extracted).length;
    const lastExtracted = req.body._lastExtracted ?? -1;
    const sameAsBefore = totalExtracted === lastExtracted;

  // Kira responde naturalmente via Groq
const onboardingReply = await groq.chat.completions.create({
  model: 'llama-3.3-70b-versatile',
  messages: [{
    role: 'system',
    content: `Você é Kira — IA de vendas calorosa e brasileira.
Está configurando o negócio de um novo cliente.

DADOS JÁ RECOLHIDOS:
- Nome negócio: ${session.data.businessName.value || 'não informado ainda'}
- Produto: ${session.data.product.value || 'não informado ainda'}
- Preço: ${session.data.price.value || 'não informado ainda'}
- Público: ${session.data.audience.value || 'não informado ainda'}

CAMPO QUE PRECISA AGORA: ${missing[0]}

MISSÃO: Responda de forma natural e calorosa.
→ Fala como brasileira — calorosa, directa, profissional
→ Termos carinhosos APENAS quando o cliente demonstrar emoção ou conquista
→ No contexto de negócios — usa "você" e seja profissional
→ NUNCA use "meu amor", "querido", "mozão" no início da conversa
→ Se já extraiu algo — confirme brevemente com entusiasmo
→ Faça UMA pergunta para o próximo campo
→ Aceite qualquer forma de resposta
→ NUNCA peça para repetir
→ Máximo 2 frases`
  },
  ...(session.history || []),
  { role: 'user', content: message }],
  temperature: 0.3
});
const reply = onboardingReply?.choices?.[0]?.message?.content || getNextQuestion(missing);
if (!session.history) session.history = [];
session.history.push({ role: 'user', content: message });
session.history.push({ role: 'assistant', content: reply });

    return res.json({ ok: true, reply, step: 'collecting', progress, missing, _lastExtracted: totalExtracted });
  } catch (err) {
    console.error('❌ Onboarding:', err);
    res.status(500).json({ error: 'Erro no onboarding' });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
app.post('/admin/setup-tenant', async (req, res) => {
  const { slug, name, nicho, url, systemPromptBase, whatsapp } = req.body;
  try {
    const content = await scrapeWebsite(url);
    const novoTenant = new Tenant({ slug, name, nicho, systemPromptBase, trainingData: content || "Sem dados", contactInfo: { whatsapp } });
    await novoTenant.save();
    res.json({ ok: true, message: `Cliente ${name} cadastrado!` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/tenants', async (req, res) => {
  try {
    const tenants = await Tenant.find();
    res.json(tenants);
  } catch (err) { res.status(500).json({ error: "Erro ao buscar clientes." }); }
});

// ─── CHAT ─────────────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  const { userId = 'anon', message, slug } = req.body;
  if (!message || !slug) return res.status(400).json({ error: 'Falta mensagem ou slug.' });
  try {
        const tenant = await Tenant.findOne({ slug });
const isOwner = tenant && tenant.ownerUserId === userId;
  
    if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });
    pushToHistory(userId, 'user', message);
    const state = stateDetector(message);
    userMemory[userId] = memoryEngine(userMemory[userId] || {}, message, state);
    saveLocalData();
    const score = scoringEngine({ message, state: state.awareness, memory: userMemory[userId], history: userHistories[userId] });
    const strategy = strategyEngine(state, score, userHistories[userId]);
    const silenceDuration = silence(state.profile, state.awareness);
    if (silenceDuration > 15000 && state.resistance) {
      return res.json({ ok: true, reply: "Estou analisando sua situação..." });
    }
    await new Promise(resolve => setTimeout(resolve, silenceDuration));
    const systemPrompt = promptComposer({ userId, memory: userMemory[userId], state, strategy, score, context: tenant.trainingData, role: tenant.systemPromptBase, isOwner, tenantName: tenant.name });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...userHistories[userId]],
      temperature: 0.5
    });
    const reply = completion?.choices?.[0]?.message?.content;
    pushToHistory(userId, 'assistant', reply);
    res.json({ ok: true, reply });
  } catch (err) {
    console.error('❌ Chat:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.listen(PORT, () => console.log(`🚀 KIRA ON - PORTA ${PORT}`));