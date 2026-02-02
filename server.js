// ================== LOAD ENV ==================
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: __dirname + '/.env' });
}

console.log('✅ GROQ_API_KEY:', process.env.GROQ_API_KEY);

// ================== IMPORTS ==================
const express = require('express');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');

const scoringEngine = require('./core/scoringEngine.js');
const memoryEngine = require('./core/memoryEngine.js');
const decisionEngine = require('./core/decisionEngine.js');
const stateDetector = require('./core/stateDetector.js');
const promptStrategyEngine = require('./core/promptStrategyEngine.js');
const promptComposer = require('./core/promptComposer.js');
const silence = require('./core/silence.js');
const strategyEngine = require('./core/strategyEngine.js');

// ================== VALIDATION ==================
if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY não carregou');
  process.exit(1);
}

// ================== SERVER CONFIG ==================
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(__dirname));

// ================== MEMORY & HISTORY ==================
let userMemory = {};
const userHistories = {};
const MEMORY_FILE = path.join(__dirname, 'user_memory.json');

try {
  if (fs.existsSync(MEMORY_FILE)) {
    userMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  }
} catch (err) {
  console.error('Erro carregando memória:', err);
}

function saveUserMemory() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(userMemory, null, 2));
  } catch (err) {
    console.error('Erro salvando memória:', err);
  }
}

function pushToHistory(userId, role, content) {
  if (!userHistories[userId]) userHistories[userId] = [];
  userHistories[userId].push({ role, content });
  if (userHistories[userId].length > 12) {
    userHistories[userId] = userHistories[userId].slice(-12);
  }
}

// ================== GROQ CLIENT ==================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ================== ROUTES ==================

// Front-end
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Reset histórico
app.post('/reset', (req, res) => {
  const { userId = 'anon' } = req.body;
  userHistories[userId] = [];
  res.json({ ok: true, message: `Histórico de ${userId} reiniciado.` });
});

// ================== CHAT (TESTE CONTROLADO) ==================
app.post('/chat', async (req, res) => {
  const { userId = 'anon', message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Mensagem vazia.' });
  }

  try {
    // 1️⃣ Salva mensagem do usuário no histórico
    pushToHistory(userId, 'user', message);

    // 2️⃣ Detecta nome do usuário
    const nameMatch = message.match(
      /\b(meu nome é|me chamo|sou)\s+([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)*)/i
    );

    if (nameMatch) {
      userMemory[userId] = userMemory[userId] || {};
      userMemory[userId].name = nameMatch[2];
      saveUserMemory();
    }

    // 3️⃣ Detecta estado do usuário
    const state = stateDetector(message);

    // 4️⃣ Define estratégia
    const strategy = strategyEngine(state);

    // 5️⃣ Monta prompt do sistema (Lisa)
    const systemPrompt = promptComposer({
      userId,
      memory: userMemory[userId] || {},
      state,
      strategy
    });

    // 6️⃣ Mensagens enviadas ao modelo
    const messages = [
      { role: 'system', content: systemPrompt },
      ...userHistories[userId]
    ];

    // 7️⃣ Chamada ao Groq
    const completion = await groq.chat.completions.create({
      model: 'llama3-70b-8192',
      messages,
      temperature: 0.7
    });

    // 8️⃣ Resposta da Lisa
    const reply = completion.choices[0].message.content;

    // 9️⃣ Salva resposta no histórico
    pushToHistory(userId, 'assistant', reply);

    // 🔟 Retorna resposta ao frontend
    res.json({
      ok: true,
      reply
    });

  } catch (err) {
    console.error('Erro processando chat:', err);
    res.status(500).json({ error: 'Erro interno no servidor da Lisa' });
  }
});
// ================== ADMIN ==================

// Histórico
app.get('/admin/history', (req, res) => {
  const { userId } = req.query;
  if (userId) return res.json({ userId, history: userHistories[userId] || [] });
  res.json({ all: userHistories });
});

// Memória
app.get('/admin/memory', (req, res) => {
  const { userId } = req.query;
  if (userId) return res.json({ userId, memory: userMemory[userId] || {} });
  res.json({ all: userMemory });
});

// Atualizar memória manualmente
app.post('/admin/memory', (req, res) => {
  const { userId, memory } = req.body;
  if (!userId || !memory) {
    return res.status(400).json({ error: 'userId e memory necessários' });
  }
  userMemory[userId] = memory;
  saveUserMemory();
  res.json({ ok: true });
});

// Feedback
app.post('/feedback', (req, res) => {
  const { userId = 'anon', userMessage, assistantReply, good = true } = req.body;
  const log = { ts: new Date().toISOString(), userId, userMessage, assistantReply, good };

  try {
    fs.appendFileSync(
      path.join(__dirname, 'feedback.log'),
      JSON.stringify(log) + '\n'
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível salvar feedback' });
  }
});

// ================== START SERVER ==================
app.listen(PORT, () => {
  console.log(`🚀 Chatbot Lisa rodando em http://localhost:${PORT}`);
});
