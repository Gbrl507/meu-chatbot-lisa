// 🤫 Silêncio Estratégico da Lisa
// Pausas calculadas para gerar valor

function calculateSilence(state) {
  switch (state) {
    case "CURIOSIDADE":
      return random(1200, 2500);

    case "INTERESSE_PRECO":
      return random(2000, 4000);

    case "INDECISAO":
      return random(3000, 5000);

    case "RESISTENCIA":
      return random(3500, 6000);

    case "INTENCAO_COMPRA":
      return random(300, 900);

    default:
      return random(800, 1800);
  }
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  calculateSilence
};
