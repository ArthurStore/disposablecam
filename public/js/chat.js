/* ═══════════════════════════════════════
   Disposable Camera — Real-Time Chat
   ═══════════════════════════════════════ */

/* globals io */

(function () {
  'use strict';

  const socket = io();
  let chatUser = null;
  let unreadCount = 0;
  let chatVisible = false;

  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatBadge = document.getElementById('chat-badge');
  const chatPanel = document.getElementById('chat-panel');
  const chatCloseBtn = document.getElementById('chat-close-btn');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');

  // Exposed globally so app.js can call it after login
  window.initChat = function (user) {
    chatUser = user;
    loadHistory();
  };

  // Toggle chat panel
  chatToggleBtn.addEventListener('click', () => {
    chatVisible = !chatVisible;
    chatPanel.classList.toggle('visible', chatVisible);
    if (chatVisible) {
      unreadCount = 0;
      chatBadge.classList.add('hidden');
      chatInput.focus();
      scrollToBottom();
    }
  });

  chatCloseBtn.addEventListener('click', () => {
    chatVisible = false;
    chatPanel.classList.remove('visible');
  });

  // Send message
  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !chatUser) return;

    socket.emit('chat-message', {
      participantNumber: chatUser.participantNumber,
      fullName: chatUser.fullName,
      text
    });

    chatInput.value = '';
    if (navigator.vibrate) navigator.vibrate(20);
  }

  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Receive message
  socket.on('chat-message', (msg) => {
    appendMessage(msg);
    if (!chatVisible) {
      unreadCount++;
      chatBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      chatBadge.classList.remove('hidden');
    }
  });

  function appendMessage(msg) {
    const isSelf = chatUser && msg.participantNumber === chatUser.participantNumber;
    const el = document.createElement('div');
    el.className = `chat-msg${isSelf ? ' self' : ''}`;

    const time = new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    el.innerHTML = `
      <div class="msg-sender">${escapeHtml(msg.fullName)} #${msg.participantNumber}</div>
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="msg-time">${time}</div>
    `;

    chatMessages.appendChild(el);
    scrollToBottom();
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/messages');
      const messages = await res.json();
      chatMessages.innerHTML = '';
      messages.forEach(appendMessage);
    } catch (err) {
      console.error('Failed to load chat history');
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
