function stateDetector(message = '') {
  const text = message.toLowerCase();

  if (
    text.includes('triste') ||
    text.includes('mal') ||
    text.includes('cansado')
  ) {
    return 'sad';
  }

  if (
    text.includes('raiva') ||
    text.includes('ódio')
  ) {
    return 'angry';
  }

  if (
    text.includes('feliz') ||
    text.includes('bem') ||
    text.includes('ótimo')
  ) {
    return 'happy';
  }

  if (
    text.includes('nome') ||
    text.includes('quem sou')
  ) {
    return 'memory';
  }

  return 'neutral';
}

module.exports = stateDetector;
