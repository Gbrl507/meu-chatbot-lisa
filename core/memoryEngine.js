// 🧠 Memory Engine da Lisa
// Registra efeito real das ações

const memory = [];

// Salva uma interação
function recordInteraction({
  state,
  silenceTime,
  userResponseTime,
  userMessage
}) {
  memory.push({
    timestamp: Date.now(),
    state,
    silenceTime,
    userResponseTime,
    userMessageLength: userMessage.length
  });

  // mantém memória leve (últimas 100 interações)
  if (memory.length > 100) {
    memory.shift();
  }
}