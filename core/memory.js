// 🧠 Memória de Efeito da Lisa
// Guarda impacto real das decisões

const memory = [];

function saveEffect({ state, strategy, responseTime, followUp }) {
  memory.push({
    state,
    strategy,
    responseTime,
    followUp,
    timestamp: Date.now()
  });
}

function getRecentEffects(limit = 5) {
  return memory.slice(-limit);
}

module.exports = {
  saveEffect,
  getRecentEffects
};
