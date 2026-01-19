require('dotenv').config(); // lê o .env que está na mesma pasta do server.js

console.log('✅ GROQ_API_KEY:', process.env.GROQ_API_KEY);

const express = require('express');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json()); // sempre antes das rotas

// Conectar GROQ
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ------------- CONFIGS -------------
const PORT = 3000;
const MAX_HISTORY = 12; // número de mensagens (user+assistant) a manter na janela
const MEMORY_FILE = path.join(__dirname, 'user_memory.json'); // para memória persistente simples
// -----------------------------------

// Carrega memória persistente (se houver)
let userMemory = {};
try {
  if (fs.existsSync(MEMORY_FILE)) {
    userMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  }
} catch (e) {
  console.error('Erro ao carregar memória:', e);
}

// Histórico em memória por usuário (não persistente)
const userHistories = {}; // key: userId -> [{role:'user'|'assistant', content: '...'}, ...]

// Prompt de sistema profissional
const SYSTEM_PROMPT = `
Você é LISA, uma assistente de vendas experiente, empática e direta.
- Fale em português brasileiro.
- Seja concisa, humana e persuasiva quando for vender.
- Evite repetir perguntas que o usuário já respondeu.
- Quando apropriado, faça oferta e direcione para fechamento.
- Não invente preços; se não souber, peça permissão para checar.
`;

// Função utilitária para salvar memória em disco
function saveUserMemoryToDisk() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(userMemory, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro salvando memória:', err);
  }
}

// Pega o histórico do userId e garante janela limitada
function pushToHistory(userId, role, content) {
  if (!userHistories[userId]) userHistories[userId] = [];
  userHistories[userId].push({ role, content });
  // manter apenas as últimas MAX_HISTORY mensagens
  if (userHistories[userId].length > MAX_HISTORY) {
    userHistories[userId] = userHistories[userId].slice(-MAX_HISTORY);
  }
}

// Pós-processamento simples da resposta (ex.: filtros, tom)
function postProcessReply(raw) {
  // exemplo: evitar respostas que começam com "Como posso ajudar"
  let r = raw.trim();
  // regras simples:
  if (/^Estou aqui para/i.test(r)) {
    r = r.replace(/^Estou aqui para[^\n]*/i, '').trim();
  }
  // garantir pontuação final
  if (r && !/[.!?]$/.test(r)) r = r + '.';
  return r;
}

// Endpoint teste (GET)
app.get('/', (req, res) => {
  res.send('Chatbot Lisa com GROQ está funcionando!');
});

/*
POST /chat
Body:
{
  "userId": "id-do-cliente-ou-temp", // opcional mas recomendado para memória por usuário
  "message": "texto"
}
*/
app.post('/chat', async (req, res) => {
  const { userId = 'anon', message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Mensagem vazia ou inválida' });
  }

  // armazenar no histórico
  pushToHistory(userId, 'user', message);

  // montar lista de mensagens a enviar ao modelo: sistema + (opcional) memory + histórico
  const memoryNote = userMemory[userId] ? `Memória do usuário: ${JSON.stringify(userMemory[userId])}` : null;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  if (memoryNote) messages.push({ role: 'system', content: memoryNote });

  // anexar histórico
  const hist = userHistories[userId] || [];
  for (const m of hist) {
    // transformar roles para o formato esperado
    messages.push({ role: m.role, content: m.content });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.85,
      // se a API suportar top_p, penalties etc, pode passar aqui:
      top_p: 0.95,
    });

    let reply = completion.choices[0].message.content || 'Desculpe, não entendi. Pode repetir?';
    reply = postProcessReply(reply);

    // armazena a resposta no histórico
    pushToHistory(userId, 'assistant', reply);

    // opcional: detectar facts para memória (muito simples: checar "meu nome é X" ou "me chamo X")
    const nameMatch = message.match(/\b(meu nome é|me chamo|sou)\s+([A-ZÀ-Úa-zà-ú]+\b(?:\s+[A-ZÀ-Úa-zà-ú]+)?)?/i);
    if (nameMatch) {
      const name = (nameMatch[2] || '').trim();
      if (name) {
        userMemory[userId] = userMemory[userId] || {};
        userMemory[userId].name = name;
        saveUserMemoryToDisk();
      }
    }

    return res.json({ reply });

  } catch (error) {
    console.error('ERRO GROQ:', error.response?.data || error);
    return res.status(500).json({ error: 'Erro interno no servidor (GROQ)' });
  }
});

// Rota para reiniciar histórico do usuário
app.post('/reset', (req, res) => {
  const { userId = 'anon' } = req.body;
  userHistories[userId] = [];
  return res.json({ ok: true, message: `Histórico de ${userId} reiniciado.` });
});

// Rota para ver histórico (útil para debug)
app.get('/admin/history', (req, res) => {
  const { userId = null } = req.query;
  if (userId) return res.json({ userId, history: userHistories[userId] || [] });
  return res.json({ all: userHistories });
});

// Rota para ver e editar memória do usuário
app.get('/admin/memory', (req, res) => {
  const { userId = null } = req.query;
  if (userId) return res.json({ userId, memory: userMemory[userId] || {} });
  return res.json({ all: userMemory });
});
app.post('/admin/memory', (req, res) => {
  const { userId, memory } = req.body;
  if (!userId || !memory) return res.status(400).json({ error: 'userId e memory necessários' });
  userMemory[userId] = memory;
  saveUserMemoryToDisk();
  return res.json({ ok: true });
});

// Feedback manual (RLHF básico): marcar se resposta foi boa/ruim e salvar o par
app.post('/feedback', (req, res) => {
  const { userId = 'anon', userMessage, assistantReply, good = true } = req.body;
  const log = { ts: new Date().toISOString(), userId, userMessage, assistantReply, good };
  try {
    fs.appendFileSync(path.join(__dirname, 'feedback.log'), JSON.stringify(log) + '\n');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível salvar feedback' });
  }
});

// iniciar servidor
app.listen(PORT, () => {
  console.log(`Chatbot Lisa rodando com GROQ em http://localhost:${PORT}`);
});
