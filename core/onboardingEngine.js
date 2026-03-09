const cors = require('cors');
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

const GROQ_KEY = process.env.GROQ_API_KEY;
const DB = process.env.MONGODB_URI || 'mongodb+srv://luisgabriel5073234_db_user:AecOennqe8JgBVVz@cluster0.1ya69kg.mongodb.net/lisa_db?retryWrites=true&w=majority';
const PORT = process.env.PORT || 3000;

mongoose.connect(DB)
  .then(() => console.log("✅ Banco Conectado!"))
  .catch(err => console.error("❌ MongoDB:", err));

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: GROQ_KEY });
console.log("✅ Groq OK!");

let userMemory = {};
const userHistories = {};
const MEMORY_FILE = path.join(__dirname, 'user_memory.json');
const HISTORY_FILE = path.join(__dirname, 'user_histories.json');

// Onboarding sessions em memória (por userId)
const onboardingSessions = {};

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

// ═══════════════════════════════════════════════
// ROTA ONBOARDING — Lisa conversa e cria tenant
// ═══════════════════════════════════════════════
app.post('/onboarding', async (req, res) => {
  const { userId = 'anon', message } = req.body;
  if (!message) return res.status(400).json({ error: 'Falta mensagem.' });

  try {
    // Inicializa sessão se não existir
    if (!onboardingSessions[userId]) {
      onboardingSessions[userId] = {
        data: JSON.parse(JSON.stringify(ONBOARDING_FIELDS)),
        step: 'collecting',
        awaitingConfirmation: false
      };

      // Primeira mensagem — Lisa se apresenta
      const welcome = `Que prazer! Sou a Lisa, sua nova vendedora autônoma. 🚀

Vou configurar tudo pra você em poucos minutos só conversando.

Pra começar — qual é o nome do seu negócio?`;

      return res.json({ ok: true, reply: welcome, step: 'collecting', progress: 0 });
    }

    const session = onboardingSessions[userId];

    // Aguardando confirmação do resumo
    if (session.awaitingConfirmation) {
      const msg = message.toLowerCase();
      const confirmed = ['sim', 'yes', 'correto', 'certo', 'perfeito', 'isso', 'exato', 'ok', 'pode', 'confirmo'].some(w => msg.includes(w));
      const denied = ['não', 'nao', 'errado', 'errei', 'corrige', 'muda', 'alterar'].some(w => msg.includes(w));

      if (confirmed) {
        // CRIAR TENANT AUTOMATICAMENTE
        const data = session.data;
        const slug = generateSlug(data.businessName.value);
        const systemPromptBase = generateSystemPrompt(data);

        const novoTenant = new Tenant({
          slug,
          name: data.businessName.value,
          nicho: data.product.value,
          systemPromptBase,
          trainingData: `Negócio: ${data.businessName.value}\nProduto: ${data.product.value}\nValor: R$ ${data.price.value}\nPúblico: ${data.audience.value}\nDiferencial: ${data.differentials.value || 'não informado'}`,
          contactInfo: { whatsapp: data.whatsapp.value || '' }
        });

        await novoTenant.save();

        // Limpa sessão
        delete onboardingSessions[userId];

        return res.json({
          ok: true,
          reply: `✅ Perfeito! Sua Lisa está configurada e pronta pra vender!

🔗 Seu link exclusivo:
*https://meu-chatbot-lisa.onrender.com?tenant=${slug}*

Compartilha esse link com seus clientes — a Lisa já começa a vender agora! 🚀`,
          step: 'complete',
          tenant: { slug, name: data.businessName.value }
        });

      } else if (denied) {
        session.awaitingConfirmation = false;
        return res.json({
          ok: true,
          reply: "Tudo bem! O que precisa corrigir? Me fala que ajusto.",
          step: 'collecting'
        });
      } else {
        return res.json({
          ok: true,
          reply: "Confirma os dados acima? É só dizer sim ou me fala o que precisa corrigir.",
          step: 'awaiting_confirmation'
        });
      }
    }

    // EXTRAIR DADOS DA MENSAGEM
    session.data = detectOnboardingData(message, session.data);
    const missing = getMissingFields(session.data);
    const total = 4; // campos obrigatórios
    const extracted = total - missing.length;
    const progress = Math.round((extracted / total) * 100);

    // Todos os campos coletados — mostrar resumo
    if (missing.length === 0) {
      session.awaitingConfirmation = true;
      const summary = generateSummary(session.data);
      return res.json({
        ok: true,
        reply: summary,
        step: 'awaiting_confirmation',
        progress: 100
      });
    }

    // Ainda faltam campos — próxima pergunta
    const nextQuestion = getNextQuestion(missing);
    
    // Resposta natural com a próxima pergunta
    let reply = '';
    if (extracted > 0) {
      const confirmations = ['Anotado!', 'Perfeito!', 'Ótimo!', 'Entendi!'];
      reply = confirmations[Math.floor(Math.random() * confirmations.length)] + ' ';
    }
    reply += nextQuestion;

    return res.json({
      ok: true,
      reply,
      step: 'collecting',
      progress,
      missing
    });

  } catch (err) {
    console.error('❌ Onboarding:', err);
    res.status(500).json({ error: 'Erro no onboarding' });
  }
});

// ═══════════════════════════════════════════════
// ROTA ADMIN — setup manual de tenant
// ═══════════════════════════════════════════════
app.post('/admin/setup-tenant', async (req, res) => {
    const { slug, name, nicho, url, systemPromptBase, whatsapp } = req.body;
    try {
        const content = url ? await scrapeWebsite(url) : '';
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

// ═══════════════════════════════════════════════
// ROTA CHAT — Lisa vende para leads
// ═══════════════════════════════════════════════
app.post('/chat', async (req, res) => {
    const { userId = 'anon', message, slug } = req.body; 
    if (!message || !slug) return res.status(400).json({ error: 'Falta mensagem ou slug.' });
    try {
        const tenant = await Tenant.findOne({ slug });
        if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });

        // userId isolado por tenant
        const tenantUserId = `${slug}__${userId}`;

        pushToHistory(tenantUserId, 'user', message);
        const state = stateDetector(message); 
        userMemory[tenantUserId] = memoryEngine(userMemory[tenantUserId] || {}, message, state);
        saveLocalData();

        const score = scoringEngine({ message, state: state.awareness, memory: userMemory[tenantUserId], history: userHistories[tenantUserId] });
        const strategy = strategyEngine(state, score, userHistories[tenantUserId]);
        const silenceDuration = silence(state.profile, state.awareness);

        if (silenceDuration > 15000 && state.resistance) {
            return res.json({ ok: true, reply: "Estou analisando sua situação..." });
        }

        await new Promise(resolve => setTimeout(resolve, silenceDuration));

        const systemPrompt = promptComposer({ 
          userId: tenantUserId, 
          memory: userMemory[tenantUserId], 
          state, strategy, score, 
          context: tenant.trainingData, 
          role: tenant.systemPromptBase 
        });

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: systemPrompt }, ...userHistories[tenantUserId]],
            temperature: 0.5
        });

        const reply = completion?.choices?.[0]?.message?.content;
        pushToHistory(tenantUserId, 'assistant', reply);
        res.json({ ok: true, reply });

    } catch (err) {
        console.error('❌ Chat:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

app.listen(PORT, () => console.log(`🚀 LISA ON - PORTA ${PORT}`));