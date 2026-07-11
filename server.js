const cors = require('cors');
const nocache = require('nocache');
require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

const scoringEngine = require('./core/scoringEngine.js');
const memoryEngine = require('./core/memoryEngine.js');
const stateDetector = require('./core/stateDetector.js');
const promptComposer = require('./core/promptComposer.js');
const silence = require('./core/silence.js');
const strategyEngine = require('./core/strategyEngine.js');
const scrapeWebsite = require('./core/webScraper.js');
const Tenant = require('./models/Tenant');
const Conversation = require('./models/Conversation');
const {
  ONBOARDING_FIELDS,
  getMissingFields,
  getNextQuestion,
  generateSummary,
  generateSlug,
  generateSystemPrompt
} = require('./core/onboardingEngine.js');

const onboardingSessions = {};
console.log('TIPO DO SCRAPER:', typeof scrapeWebsite);

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const DB = process.env.MONGO_URI;
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

// ─── LLM SETUP ────────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const groq = new Groq({ apiKey: GROQ_KEY });

// 3º fallback — Groq
async function callGroq(systemPrompt, messages, temperature = 0.3) {
  try {
    const history = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      temperature,
      max_tokens: 1024
    });
    console.log('⚡ Groq respondeu');
    return completion.choices[0]?.message?.content || null;
  } catch(e) {
    console.error('❌ Groq error:', e.message);
    return null;
  }
}

// 2º fallback — Gemini
async function callGeminiDirect(systemPrompt, messages, temperature = 0.3) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt
    });
    const history = messages.slice(0, -1)
      .filter(m => m.content && typeof m.content === 'string' && m.content.trim() !== '')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
    const lastMsg = messages[messages.length - 1]?.content || '';
    if (!lastMsg) return null;
    const chat = model.startChat({ history, generationConfig: { temperature } });
    const result = await chat.sendMessage(lastMsg);
    console.log('✨ Gemini respondeu');
    return result.response.text();
  } catch(e) {
    if (e.status === 429) {
      console.log('⚠️ Gemini limite — usando Groq');
      return await callGroq(systemPrompt, messages, temperature);
    }
    console.error('❌ Gemini error:', e.message);
    return await callGroq(systemPrompt, messages, temperature);
  }
}

// 1º principal — DeepSeek com fallback para Gemini → Groq
async function callGemini(systemPrompt, messages, temperature = 0.3) {
  try {
    const history = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        temperature,
        max_tokens: 1024
      })
    });
    if (!response.ok) {
      const err = await response.json();
      console.log(`⚠️ DeepSeek erro ${response.status} — usando Gemini`);
      return await callGeminiDirect(systemPrompt, messages, temperature);
    }
    const data = await response.json();
    console.log('🧠 DeepSeek respondeu');
    return data.choices[0]?.message?.content || await callGeminiDirect(systemPrompt, messages, temperature);
  } catch(e) {
    console.log('⚠️ DeepSeek falhou — usando Gemini');
    return await callGeminiDirect(systemPrompt, messages, temperature);
  }
}

// ─── MEMÓRIA LOCAL ────────────────────────────────────────────────────────────
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
    if (message === '__init__') delete onboardingSessions[userId];

    if (!onboardingSessions[userId]) {
      onboardingSessions[userId] = {
        data: JSON.parse(JSON.stringify(ONBOARDING_FIELDS)),
        awaitingConfirmation: false,
        history: []
      };
      return res.json({ ok: true, reply: `Oi! Sou a KIRA 👋\nVou configurar sua IA de vendas em menos de 5 minutos.\nQual é o nome do seu negócio?`, step: 'collecting', progress: 0 });
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
          slug,
          name: data.businessName.value,
          nicho: data.product.value,
          systemPromptBase: generateSystemPrompt(data),
          trainingData: `Negócio: ${data.businessName.value}\nProduto: ${data.product.value}\nValor: R$ ${data.price.value}\nPúblico: ${data.audience.value}`,
          contactInfo: { whatsapp: data.whatsapp?.value || '' },
          ownerUserId: userId
        });
        await novoTenant.save();
        if (!global.ownerSessions) global.ownerSessions = {};
        global.ownerSessions[userId] = { slug, name: data.businessName.value, isOwner: true };
        delete onboardingSessions[userId];
        return res.json({
          ok: true,
          reply: `✅ Prontinho! 🚀\n\nTudo configurado — sou a Kira e já sei tudo sobre o ${data.businessName.value}!\n\n🔗 Link dos seus clientes:\nhttps://meu-chatbot-lisa.onrender.com/?tenant=${slug}\n\nComo posso te chamar? 😊`,
          step: 'complete',
          tenant: { slug, name: data.businessName.value }
        });
      } else if (denied) {
        session.awaitingConfirmation = false;
        return res.json({ ok: true, reply: "Tudo bem! O que precisa corrigir?", step: 'collecting' });
      } else {
        return res.json({ ok: true, reply: "Confirma os dados? É só dizer sim ou me fala o que corrigir.", step: 'awaiting_confirmation' });
      }
    }

    session.history.push({ role: 'user', content: message });

    const systemOnboarding = `Você é Kira — IA de vendas brasileira, calorosa e natural.
Está fazendo onboarding de um novo cliente para configurar a IA de vendas dele.

DADOS JÁ COLETADOS:
- Nome negócio: ${session.data.businessName.value || 'não informado'}
- Produto: ${session.data.product.value || 'não informado'}
- Preço: ${session.data.price.value || 'não informado'}
- Público: ${session.data.audience.value || 'não informado'}

CAMPOS QUE FALTAM: ${getMissingFields(session.data).join(', ') || 'nenhum'}

SUA TAREFA — responda em JSON com este formato EXATO:
{
  "extracted": {
    "businessName": "valor extraído ou null",
    "product": "valor extraído ou null",
    "price": "valor extraído ou null",
    "audience": "valor extraído ou null"
  },
  "reply": "sua resposta natural aqui"
}

REGRAS DE EXTRAÇÃO:
- Extrai APENAS o que o usuário disse nesta mensagem
- Se não mencionou um campo, coloca null
- Não repete campos já coletados

REGRAS DE RESPOSTA:
- Seja natural, calorosa, brasileira
- Se extraiu algo novo, confirme brevemente com entusiasmo
- Faça UMA pergunta para o próximo campo que falta
- Se o usuário está só conversando (oi, tudo bem), responda naturalmente e pergunte o próximo campo
- NUNCA use "meu amor", "querido", "mozão"
- Máximo 2 frases
- Responda APENAS o JSON, nada mais`;

    const raw = await callGemini(systemOnboarding, session.history, 0.3);
    let reply = getNextQuestion(getMissingFields(session.data));

    if (raw) {
      try {
        const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.extracted) {
            const e = parsed.extracted;
            if (e.businessName && e.businessName !== 'null' && !session.data.businessName.extracted)
              session.data.businessName = { ...session.data.businessName, extracted: true, value: e.businessName };
            if (e.product && e.product !== 'null' && !session.data.product.extracted)
              session.data.product = { ...session.data.product, extracted: true, value: e.product };
            if (e.price && e.price !== 'null' && !session.data.price.extracted)
              session.data.price = { ...session.data.price, extracted: true, value: e.price };
            if (e.audience && e.audience !== 'null' && !session.data.audience.extracted)
              session.data.audience = { ...session.data.audience, extracted: true, value: e.audience };
          }
          if (parsed.reply) reply = parsed.reply;
        }
      } catch(e) {
        if (raw.length < 500 && !raw.includes('{')) reply = raw.trim();
      }
    }

    session.history.push({ role: 'assistant', content: reply });

    const missing = getMissingFields(session.data);
    const progress = Math.round(((4 - missing.length) / 4) * 100);

    if (missing.length === 0) {
      session.awaitingConfirmation = true;
      const confirmReply = generateSummary(session.data);
      session.history[session.history.length - 1].content = confirmReply;
      return res.json({ ok: true, reply: confirmReply, step: 'awaiting_confirmation', progress: 100 });
    }

    return res.json({ ok: true, reply, step: 'collecting', progress, missing });

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

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
app.get('/dashboard/stats', async (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Falta slug.' });
  try {
    const conversations = await Conversation.find({ slug });
    const totalConversas = conversations.length;
    const leadsQualificados = conversations.filter(c => c.score >= 40).length;
    const vendasFechadas = conversations.filter(c => c.converted).length;
    const scoreMedio = totalConversas > 0 
      ? Math.round(conversations.reduce((acc, c) => acc + (c.score || 0), 0) / totalConversas) : 0;
    const receita = vendasFechadas * 497;
    const taxa = totalConversas > 0 ? Math.round((leadsQualificados / totalConversas) * 100) : 0;
    const leads = conversations
      .sort((a, b) => b.score - a.score).slice(0, 10)
      .map(c => ({
        name: c.leadName || 'Lead', score: c.score || 0,
        msg: c.messages?.slice(-1)[0]?.content?.substring(0, 60) + '...' || '',
        status: c.status || 'cold', messages: c.messages?.slice(-6) || []
      }));
    const timeline = conversations
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5)
      .map(c => {
        const diff = Math.round((Date.now() - new Date(c.updatedAt)) / 60000);
        const time = diff < 60 ? `${diff}min` : `${Math.round(diff/60)}h`;
        return { ico: c.status === 'hot' ? '🔥' : c.status === 'warm' ? '💙' : '❄️', name: c.leadName || 'Lead', meta: `Score ${c.score} · ${c.status}`, time };
      });
    res.json({ totalConversas, leadsQualificados, vendasFechadas, scoreMedio, receita, taxa, interessados: conversations.filter(c => c.score >= 60).length, leads, timeline });
  } catch (err) {
    console.error('❌ Dashboard stats:', err);
    res.status(500).json({ error: 'Erro ao buscar stats.' });
  }
});

// ─── CHAT ─────────────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  const { userId = 'anon', message, slug } = req.body;
  if (!message || !slug) return res.status(400).json({ error: 'Falta mensagem ou slug.' });
  try {
    const tenant = await Tenant.findOne({ slug });
    if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });
    const isOwner = tenant.ownerUserId === userId;
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
    const reply = await callGemini(systemPrompt, userHistories[userId], 0.2);
    pushToHistory(userId, 'assistant', reply);
    if (!isOwner) {
      try {
        const leadName = userMemory[userId]?.name || 'Lead';
        await Conversation.findOneAndUpdate(
          { slug, userId },
          {
            $push: { messages: [{ role: 'user', content: message }, { role: 'assistant', content: reply }] },
            $set: { score, leadName, status: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold', updatedAt: new Date() }
          },
          { upsert: true, new: true }
        );
      } catch(e) { console.error('❌ Conversation save:', e); }
    }
    res.json({ ok: true, reply });
  } catch (err) {
    console.error('❌ Chat:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── WEBHOOK WHATSAPP ─────────────────────────────────────────────────────────
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    if (!body?.data?.message?.conversation) return res.sendStatus(200);
    const message = body.data.message.conversation;
    const from = body.data.key?.remoteJid?.replace('@lid', '@s.whatsapp.net') || body.data.key?.remoteJid;
    const fromMe = body.data.key?.fromMe;
    if (fromMe) return res.sendStatus(200);
    console.log(`📱 WhatsApp de ${from}: ${message}`);
    const tenant = await Tenant.findOne();
    if (!tenant) return res.sendStatus(200);
    const userId = from;
    pushToHistory(userId, 'user', message);
    const state = stateDetector(message);
    userMemory[userId] = memoryEngine(userMemory[userId] || {}, message, state);
    saveLocalData();
    const score = scoringEngine({ message, state: state.awareness, memory: userMemory[userId], history: userHistories[userId] });
    const strategy = strategyEngine(state, score, userHistories[userId]);
    const systemPrompt = promptComposer({ userId, memory: userMemory[userId], state, strategy, score, context: tenant.trainingData, role: tenant.systemPromptBase, isOwner: false, tenantName: tenant.name });
    const reply = await callGemini(systemPrompt, userHistories[userId], 0.2);
    pushToHistory(userId, 'assistant', reply);
    const sendResponse = await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/nakira`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
      body: JSON.stringify({ number: from, options: { delay: 1000 }, textMessage: { text: reply } })
    });
    const sendResult = await sendResponse.json();
    console.log(`📤 Envio resultado:`, JSON.stringify(sendResult));
    console.log(`✅ Kira respondeu para ${from}: ${reply}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook WhatsApp:', err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`🚀 KIRA ON - PORTA ${PORT}`));
