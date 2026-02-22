// core/decisionEngine.js

/**
 * 🧠 Decision Engine (Repassador)
 * Mantemos este arquivo para não quebrar o server.js, 
 * mas a lógica real agora vive no strategyEngine.
 */
function decisionEngine(data) {
  // Apenas retorna um objeto básico para o server.js não "reclamar"
  return {
    status: "active",
    processed: true
  };
}

module.exports = decisionEngine;