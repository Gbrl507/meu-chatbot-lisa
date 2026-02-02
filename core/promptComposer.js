// core/promptComposer.js

/**
 * Prompt Composer
 * Traduz decisões estratégicas em instruções de linguagem.
 * NÃO decide estratégia.
 * NÃO conhece o produto.
 * Apenas controla COMO falar.
 */

function composePrompt(strategy) {
  /**
   * strategy exemplo:
   * {
   *   style: 'direto',
   *   goal: 'renda_imediata',
   *   humanState: 'impaciente',
   *   funnelStage: 'qualificacao',
   * }
   */

  const prompt = {
    maxSentences: 2,
    tone: 'neutro',
    questions: 1,
    rhythm: 'rápido',
    verbosity: 'baixa'
  };

  // ===== ESTADO HUMANO =====
  if (strategy.humanState === 'impaciente') {
    prompt.maxSentences = 2;
    prompt.questions = 1;
    prompt.verbosity = 'mínima';
    prompt.rhythm = 'rápido';
  }

  // ===== OBJETIVO =====
  if (strategy.goal === 'renda_imediata') {
    prompt.tone = 'objetivo';
  }

  // ===== ESTILO =====
  if (strategy.style === 'direto') {
    prompt.tone = 'firme';
  }

  // ===== FUNIL =====
  if (strategy.funnelStage === 'qualificacao') {
    prompt.questions = 1;
  }

  return prompt;
}

module.exports = {
  composePrompt
};
