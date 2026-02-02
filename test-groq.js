require('dotenv').config();
const Groq = require('groq-sdk');

// Inicializa o cliente
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Função de teste simples
async function testeGroq() {
  try {
    // Vamos só listar algo básico ou checar se a conexão funciona
    // Dependendo da API do Groq, você pode colocar uma query real
    const resultado = await groq.query('*[_type == "post"][0]'); // exemplo: pega o primeiro "post" se existir
    console.log('Resultado do teste Groq:', resultado);
  } catch (err) {
    console.error('Erro ao testar Groq:', err);
  }
}

testeGroq();
