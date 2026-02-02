// core/decisionEngine.js

function decide(score) {
  if (score <= 0) {
    return {
      state: 'FRIO',
      strategy: 'AQUECER'
    };
  }

  if (score <= 2) {
    return {
      state: 'CURIOSO',
      strategy: 'EXPLORAR'
    };
  }

  if (score <= 4) {
    return {
      state: 'QUENTE',
      strategy: 'AVANCAR'
    };
  }

  return {
    state: 'DECIDIDO',
    strategy: 'FECHAR'
  };
}

module.exports = {
  decide
};
