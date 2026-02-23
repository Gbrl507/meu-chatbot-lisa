// ================== 1. CONFIGURAÇÃO E IMPORTS ==================
const cors = require('cors');
require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');

// Importação dos seus motores (Pasta Core)
const scoringEngine = require('./core/scoringEngine.js');
const memoryEngine = require('./core/memoryEngine.js');
const stateDetector = require('./core/stateDetector.js');
const promptComposer = require('./core/promptComposer.js');
const silence = require('./core/silence.js');
const strategyEngine = require('./core/strategyEngine.js');
const scrapeWebsite = require('./core/webScraper.js');

// Modelo do Banco (Pasta Models)
const Tenant = require('./models/Tenant');
console.log('TIPO DO SCRAPER:', typeof scrapeWebsite);

// ================== 2. CONEXÃO E VALIDAÇÃO ==================
if (!process.env.GROQ_API_KEY) {
    console.error('❌ ERRO: GROQ_API_KEY ausente no .env');
    process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://luisgabriel5073234_db_user:AecOennqe8JgBVVz@cluster0.1ya69kg.mongodb.net/lisa_db?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Banco de Dados Multi-Tenant Conectado!"))
  .catch(err => console.error("❌ Erro no MongoDB:", err));

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ================== 3. MEMÓRIA E HISTÓRICO (JSON) ==================
let userMemory = {};
const userHistories = {};
const MEMORY_FILE = path.join(__dirname, 'user_memory.json');
const HISTORY_FILE = path.join(__dirname, 'user_histories.json');

function loadLocalData() {
    try {
        if (fs.existsSync(MEMORY_FILE)) userMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
        if (fs.existsSync(HISTORY_FILE)) Object.assign(userHistories, JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')));
    } catch (e) { console.error("Erro ao ler JSONs:", e); }
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

// ================== 4. ROTAS ADMIN (CADASTRAR E LISTAR CLIENTES) ==================

// 1. Rota para Cadastrar novo Cliente (Onboarding com Scraper)
app.post('/admin/setup-tenant', async (req, res) => {
    const { slug, name, nicho, url, systemPromptBase, whatsapp } = req.body;
    try {
        console.log(`🤖 Treinando Lisa para: ${name}...`);
        
        // Lisa lê o site do cliente para aprender os serviços
        const content = await scrapeWebsite(url);
        
        const novoTenant = new Tenant({
            slug, 
            name, 
            nicho, 
            systemPromptBase,
            trainingData: content || "Sem dados de treinamento",
            contactInfo: { whatsapp }
        });

        await novoTenant.save();
        console.log(`✅ Cliente ${name} salvo no banco de dados!`);
        res.json({ ok: true, message: `Cliente ${name} cadastrado e treinado!` });
    } catch (err) { 
        console.error("❌ Erro no Setup:", err.message);
        res.status(500).json({ error: err.message }); 
    }
});

// 2. Rota para Listar todos os clientes (Para você conferir se salvou)
app.get('/admin/tenants', async (req, res) => {
    try {
        const tenants = await Tenant.find();
        res.json(tenants);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar clientes no banco." });
    }
});
// ================== 5. ROTA DE CHAT (O SEU PIPELINE) ==================

app.post('/chat', async (req, res) => {
    const { userId = 'anon', message, slug } = req.body; 

    if (!message || !slug) return res.status(400).json({ error: 'Falta mensagem ou slug.' });

    try {
        // 🔍 Busca contexto do cliente (Tenant) no Banco
        const tenant = await Tenant.findOne({ slug });
        if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });

        pushToHistory(userId, 'user', message);

        // --- INÍCIO DO SEU CÓDIGO COGNITIVO ---
        
        // 1️⃣ Scanner Neuropsicológico
        const state = stateDetector(message); 

        // 2️⃣ Atualiza Memória
        userMemory[userId] = memoryEngine(userMemory[userId] || {}, message, state);
        saveLocalData();

        // 3️⃣ Cálculo de Score
        const score = scoringEngine({
            message,
            state: state.awareness, 
            memory: userMemory[userId],
            history: userHistories[userId]
        });

        // 4️⃣ Motor de Estratégia
        const strategy = strategyEngine(state, score, userHistories[userId]);

        // 5️⃣ Silêncio Estratégico
        const silenceDuration = silence(state.profile, state.awareness);
        if (silenceDuration > 15000 && state.resistance) {
            return res.json({ ok: true, reply: "Estou analisando sua situação detalhadamente..." });
        }

        await new Promise(resolve => setTimeout(resolve, silenceDuration));

        // 6️⃣ Geração do Prompt (Combinando Memória + Dados do Banco)
        const systemPrompt = promptComposer({ 
            userId, 
            memory: userMemory[userId], 
            state, 
            strategy, 
            score,
            context: tenant.trainingData, // Dados do cliente vindos do MongoDB
            role: tenant.systemPromptBase // Nicho vindo do MongoDB
        });

        // 7️⃣ Chamada Groq
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: systemPrompt }, ...userHistories[userId]],
            temperature: 0.5
        });

        const reply = completion?.choices?.[0]?.message?.content;

        // 8️⃣ Finalização
        pushToHistory(userId, 'assistant', reply);
        res.json({ ok: true, reply });

    } catch (err) {
        console.error('❌ Erro no Chat:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// ================== 6. START ==================
app.listen(PORT, () => {
    console.log(`🚀 LISA MULTI-TENANT ON - PORTA ${PORT}`);
});