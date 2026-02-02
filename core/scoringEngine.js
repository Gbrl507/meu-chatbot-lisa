// core/scoringEngine.js

const decisions = {};

/**
 * Registra uma decisão tomada pela IA
 */
function registerDecision({ userId, strategy }) {
  const decisionId = `${userId}_${Date.now()}`;

  decisions[decisionId] = {
    decisionId,
    userId,
    strategy,
    score: 50, // começa neutro
    signals: [],
    createdAt: Date.now(),
    finalized: false
  };

  return decisionId;
}

/**
 * Aplica um sinal ao score
 */
function applySignal(decisionId, value, reason) {
  const d = decisions[decisionId];
  if (!d || d.finalized) return;

  d.score += value;
  d.signals.push({
    value,
    reason,
    at: Date.now()
  });

  // clamp simples
  if (d.score < 0) d.score = 0;
  if (d.score > 100) d.score = 100;
}

/**
 * Finaliza a decisão
 */
function finalizeDecision(decisionId) {
  const d = decisions[decisionId];
  if (!d) return null;

  d.finalized = true;
  d.finishedAt = Date.now();
  return d;
}

/**
 * Obtém decisão
 */
function getDecision(decisionId) {
  return decisions[decisionId] || null;
}

module.exports = {
  registerDecision,
  applySignal,
  finalizeDecision,
  getDecision
};
