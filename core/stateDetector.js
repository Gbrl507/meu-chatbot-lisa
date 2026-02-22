// core/stateDetector.js

function stateDetector(message = '') {
  const text = message.toLowerCase();

  // 1. Identificação de Perfil Decisor (Neuropsicologia)
  const isPragmatic = /\b(preço|valor|quanto|agora|rápido|direto|objetivo)\b/i.test(text);
  const isAnalytic = /\b(como|funciona|detalhe|dados|prova|segurança|garantia|ciência)\b/i.test(text);
  const isExpressive = /\b(melhor|topo|exclusivo|diferente|vencer|impacto)\b/i.test(text);

  // 2. Detecção de Nível de Consciência (Funil de Vendas Sênior)
  let awarenessLevel = 'NEUTRAL';
  if (/\b(não sei|problema|difícil|ajuda|preciso)\b/i.test(text)) awarenessLevel = 'PROBLEM_AWARE';
  if (/\b(solução|comparar|opção|alternativa)\b/i.test(text)) awarenessLevel = 'SOLUTION_AWARE';
  if (/\b(fechar|comprar|contratar|assinar|pagamento)\b/i.test(text)) awarenessLevel = 'DECISION_READY';

  // 3. Mapeamento de Resistência (Objeções Implícitas)
  const hasResistance = /\b(caro|depois|pensar|verificar|equipe|chefe)\b/i.test(text);

  return {
    profile: isPragmatic ? 'PRAGMATIC' : isAnalytic ? 'ANALYTIC' : isExpressive ? 'EXPRESSIVE' : 'AFFABLE',
    awareness: awarenessLevel,
    resistance: hasResistance,
    originalText: text
  };
}

module.exports = stateDetector;
