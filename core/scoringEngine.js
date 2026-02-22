// core/scoringEngine.js

/**
 * 📈 Motor de Pontuação de Vendas (Scoring)
 * Calcula de 0 a 100 a probabilidade de fechamento baseada no comportamento.
 */
function scoringEngine({ message, state, memory, history }) {
  let score = 50; // Começamos no meio (neutro)
  const text = message.toLowerCase();

  // 1. Sinais Positivos (Aumentam o score)
  if (state === 'DECISION_READY') score += 30;
  if (state === 'SOLUTION_AWARE') score += 15;
  if (/\b(comprar|fechar|pagamento|cartão|pix|contrato|assinar)\b/i.test(text)) score += 20;
  if (memory && memory.name) score += 5; // Cliente que dá o nome está mais engajado

  // 2. Sinais Negativos (Diminuem o score)
  if (/\b(caro|depois|pensar|amanhã|chefe|sócio|dúvida)\b/i.test(text)) score -= 20;
  if (history && history.length > 15) score -= 10; // Conversas longas demais sem fechamento tendem a esfriar

  // 3. Trava de Segurança (Clamp entre 0 e 100)
  return Math.min(Math.max(score, 0), 100);
}

// Exportação correta para o server.js
module.exports = scoringEngine;
