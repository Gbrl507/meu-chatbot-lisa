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

console.log('TIPO DO SCRAPER:', typeof scrapeWebsite);

const GROQ_KEY = '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';
const DB = 'mongodb+srv://luisgabriel5073234_db_user:AecOennqe8JgBVVz@cluster0.1ya69kg.mongodb.net/lisa_db?retryWrites=true&w=majority';
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

app.listen(PORT, () => console.log(`🚀 LISA ON - PORTA ${PORT}`));