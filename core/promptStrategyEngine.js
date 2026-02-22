// core/promptStrategyEngine.js

/**
 * 🎯 Prompt Strategy Engine (Suporte)
 * Mantemos para compatibilidade, mas a inteligência agora 
 * está centralizada no strategyEngine.js
 */
function promptStrategyEngine(data) {
  return {
    status: "integrated",
    mode: data.state?.profile || "NEUTRAL"
  };
}

module.exports = promptStrategyEngine;