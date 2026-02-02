const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');

// 🔗 URL DO BACKEND (Render)
const API_URL = 'COLE_AQUI_A_URL_DO_RENDER';

function addMessage(text, className) {
  const div = document.createElement('div');
  div.className = `msg ${className}`;
  div.innerText = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addMessage('Você: ' + text, 'user');
  input.value = '';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    const data = await res.json();
    addMessage('Lisa: ' + data.reply, 'lisa');

  } catch (err) {
    addMessage('Erro ao falar com a Lisa 😵', 'lisa');
  }
}
