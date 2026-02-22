const backendUrl = window.location.origin; // pega localhost ou URL do Render

const chat = document.getElementById('chat');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('send');

const userIdKey = 'userId';
let userId = localStorage.getItem(userIdKey);
if (!userId) {
  userId = 'user_' + Math.floor(Math.random() * 1000000);
  localStorage.setItem(userIdKey, userId);
}

const historyKey = 'chatHistory_' + userId;
let chatHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');

function addMessage(text, cls) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

  // Salva histórico
  chatHistory.push({ text, cls });
  localStorage.setItem(historyKey, JSON.stringify(chatHistory));
}

// Renderiza histórico existente
chatHistory.forEach(msg => addMessage(msg.text, msg.cls));

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  messageInput.value = '';

  const typingDiv = document.createElement('div');
  typingDiv.id = 'typing';
  typingDiv.textContent = 'Lisa está digitando...';
  chat.appendChild(typingDiv);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

  try {
    const res = await fetch(`${backendUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message })
    });

    const data = await res.json();
    typingDiv.remove();

    if (data?.reply) {
      addMessage(data.reply, 'lisa');
    } else if (data?.error) {
      addMessage(`Erro: ${data.error}`, 'lisa');
    } else {
      addMessage('Sem resposta', 'lisa');
    }
  } catch (err) {
    typingDiv.remove();
    addMessage('Erro ao conectar com a Lisa', 'lisa');
    console.error('Erro no fetch /chat:', err);
  }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

