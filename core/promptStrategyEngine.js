// core/promptStrategyEngine.js

function applyPromptStrategy(basePrompt, strategy) {
  let instruction = '';

  switch (strategy) {
    case 'AQUECER':
      instruction = `
Foque em empatia e conforto.
Faça perguntas abertas.
Não pressione.
`;
      break;

    case 'EXPLORAR':
      instruction = `
Ajude o usuário a clarear necessidades.
Faça perguntas objetivas.
`;
      break;

    case 'AVANCAR':
      instruction = `
Mostre benefícios claros.
Direcione para o próximo passo.
`;
      break;

    case 'FECHAR':
      instruction = `
Seja direto.
Remova objeções.
Conduza para decisão agora.
`;
      break;
  }

  return `
${basePrompt}

--- Diretriz de Comunicação ---
${instruction}
`;
}

module.exports = {
  applyPromptStrategy
};
