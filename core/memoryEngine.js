// core/memoryEngine.js

/**
 * 🧠 Memory Engine da Lisa (Versão Neurovendas)
 * Filtra e guarda o que realmente importa para a persuasão.
 */
function memoryEngine(currentMemory = {}, message = '', state = {}) {
  const text = message.toLowerCase();
  const updatedMemory = { ...currentMemory };

  // 1. Captura de Dores e Necessidades
  if (/\b(preciso|falta|difícil|problema|ruim|perda|custo|gastando)\b/i.test(text)) {
    updatedMemory.lastPainPoint = message;
  }

  // 2. Captura de Objeções (para a Lisa não repetir o erro)
  if (state.resistance) {
    updatedMemory.lastObjection = message;
    updatedMemory.resistanceCount = (updatedMemory.resistanceCount || 0) + 1;
  }

  // 3. Atualiza o perfil comportamental na memória de longo prazo
  if (state.profile) {
    updatedMemory.detectedProfile = state.profile;
  }

  // 4. Histórico de Nível de Consciência
  if (state.awareness) {
    updatedMemory.currentAwareness = state.awareness;
  }

  return updatedMemory;
}

// ESTA LINHA É A MAIS IMPORTANTE PARA RESOLVER O ERRO:
module.exports = memoryEngine;