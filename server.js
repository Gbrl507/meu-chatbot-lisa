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
}app.post('/onboarding', async (req, res) => {
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
     return res.json({ ok: true, reply: `Oi! Sou a KIRA 👋\nVou configurar sua IA de vendas em menos de 5 minutos.\nQual é o seu nome?`, step: 'collecting', progress: 0 });
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
          contactInfo: { whatsapp: data.whatsapp.value || '' }
        });
        await novoTenant.save();
        delete onboardingSessions[userId];
        return res.json({ ok: true, reply: `✅ Sua Kira está configurada!\n\n🔗 Seu link exclusivo:\nhttps://meu-chatbot-lisa.onrender.com/?tenant=${slug}\n\nCompartilha com seus clientes — a kira já começa a vender! 🚀`, step: 'complete', tenant: { slug, name: data.businessName.value } });
      } else if (denied) {
        session.awaitingConfirmation = false;
        return res.json({ ok: true, reply: "Tudo bem! O que precisa corrigir?", step: 'collecting' });
      } else {
        return res.json({ ok: true, reply: "Confirma os dados? É só dizer sim ou me fala o que corrigir.", step: 'awaiting_confirmation' });
      }
    }
    session.data = detectOnboardingData(message, session.data);
    const missing = getMissingFields(session.data);
    const progress = Math.round(((4 - missing.length) / 4) * 100);
    if (missing.length === 0) {
      session.awaitingConfirmation = true;
      return res.json({ ok: true, reply: generateSummary(session.data), step: 'awaiting_confirmation', progress: 100 });
    }
    const confirmations = ['Anotado!','Perfeito!','Ótimo!','Entendi!'];
// Verifica se extraiu algo novo
const totalExtracted = Object.values(session.data).filter(f => f.extracted).length;
const lastExtracted = req.body._lastExtracted ?? -1;
const sameAsBefore = totalExtracted === lastExtracted;

let reply;
if (sameAsBefore && lastExtracted >= 0) { 
  const hints = {
    businessName: "Hmm, não entendi bem 😅 Me diz só o nome da sua empresa — exemplo: 'Advocacia Silva' ou 'Clínica Estética Prime'. Qual é o nome do seu negócio?",
    product: "Não captei! Me conta o que você vende — exemplo: 'vendo consultoria jurídica' ou 'faço limpeza de pele'. O que você vende?",
    price: "Não entendi o valor 😅 Exemplo: 'cobro R$500 por sessão' ou 'pacotes a partir de R$2.000'. Qual é o seu preço?",
    audience: "Me conta para quem você vende — exemplo: 'atendo empresários' ou 'meu público são mulheres de 30 a 50 anos'. Para quem você vende?"
  };
  reply = hints[missing[0]] || getNextQuestion(missing);
} else {
  reply = (session.data.businessName.extracted || session.data.product.extracted ? confirmations[Math.floor(Math.random()*confirmations.length)] + ' ' : '') + getNextQuestion(missing);
}

return res.json({ ok: true, reply, step: 'collecting', progress, missing, _lastExtracted: totalExtracted });
  } catch (err) {
    console.error('❌ Onboarding:', err);
    res.status(500).json({ error: 'Erro no onboarding' });
  }
});

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

app.post('/chat', async (req, res) => {
    const { userId = 'anon', message, slug } = req.body; 
    if (!message || !slug) return res.status(400).json({ error: 'Falta mensagem ou slug.' });
    try {
        const tenant = await Tenant.findOne({ slug });
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
        const systemPrompt = promptComposer({ userId, memory: userMemory[userId], state, strategy, score, context: tenant.trainingData, role: tenant.systemPromptBase });
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
