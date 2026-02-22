// core/strategyEngine.js

/**
 * 🎯 Motor de Estratégia Sênior da Lisa
 * Decide entre SPIN, Challenger ou Fechamento com base no Score e Consciência.
 */
function strategyEngine(state, score = 0, history = []) {
  const { profile, awareness, resistance } = state;

  // 1. Estratégia para Baixa Consciência (Challenger Sale)
  // Se o cliente não sabe que tem um problema, a Lisa "provoca" com insights.
  if (awareness === 'NEUTRAL' || awareness === 'PROBLEM_AWARE') {
    return {
      mode: 'PROVOCATIVE',
      goal: 'INSIGHT_CHALLENGE',
      technique: 'CHALLENGER',
      action: 'Educar o cliente sobre um risco que ele não vê.'
    };
  }

  // 2. Estratégia para Consideração (SPIN Selling)
  // Se ele já busca solução, a Lisa investiga Implicação e Necessidade.
  if (awareness === 'SOLUTION_AWARE') {
    return {
      mode: 'INVESTIGATIVE',
      goal: 'AMPLIFY_PAIN',
      technique: 'SPIN',
      action: 'Fazer perguntas de Implicação para aumentar o valor da solução.'
    };
  }

  // 3. Estratégia para Fechamento (Hard Close / Neurovendas)
  // Se o score é alto e ele está pronto, a Lisa remove objeções finais.
  if (awareness === 'DECISION_READY' || score > 80) {
    return {
      mode: 'DIRECT',
      goal: 'CLOSE_DEAL',
      technique: 'NEURO_CLOSING',
      action: 'Usar gatilhos de Escassez e Prova Social para fechar agora.'
    };
  }

  // 4. Tratamento de Resistência Crítica
  if (resistance) {
    return {
      mode: 'EMPATHETIC',
      goal: 'REDUCE_FRICTION',
      technique: 'MIRRORING',
      action: 'Validar a objeção e reestruturar o valor.'
    };
  }

  return {
    mode: 'NEUTRAL',
    goal: 'ENGAGE',
    technique: 'CONVERSATIONAL'
  };
}

module.exports = strategyEngine;