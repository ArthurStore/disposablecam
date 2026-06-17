/* ═══════════════════════════════════════
   Disposable Camera — Real-Time Chat
   Public + Private messaging, media sharing
   ═══════════════════════════════════════ */

/* globals io */

(function () {
  'use strict';

  const BASE = (function () {
    const p = window.location.pathname;
    return p.endsWith('/') ? p : p.replace(/\/[^/]*$/, '/');
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  const socket = io({ path: BASE + 'socket.io' });

  let chatUser = null;
  let unreadCount = 0;
  let chatVisible = false;
  let chatMode = 'public'; // public | private
  let privateRecipient = null;

  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatBadge = document.getElementById('chat-badge');
  const chatPanel = document.getElementById('chat-panel');
  const chatCloseBtn = document.getElementById('chat-close-btn');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatTabPublic = document.getElementById('chat-tab-public');
  const chatTabPrivate = document.getElementById('chat-tab-private');
  const privateRecipientBar = document.getElementById('private-recipient-bar');
  const privateRecipientSelect = document.getElementById('private-recipient');
  const chatAttachBtn = document.getElementById('chat-attach-btn');
  const chatFileInput = document.getElementById('chat-file-input');
  const chatUploadError = document.getElementById('chat-upload-error');

  window.initChat = function (user) {
    chatUser = user;
    loadParticipants();
    loadHistory();
  };

  chatToggleBtn.addEventListener('click', () => {
    chatVisible = !chatVisible;
    chatPanel.classList.toggle('hidden', !chatVisible);
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
    chatPanel.classList.add('hidden');
  });

  chatTabPublic.addEventListener('click', () => switchChatMode('public'));
  chatTabPrivate.addEventListener('click', () => switchChatMode('private'));

  function switchChatMode(mode) {
    chatMode = mode;
    chatTabPublic.classList.toggle('active', mode === 'public');
    chatTabPrivate.classList.toggle('active', mode === 'private');
    privateRecipientBar.classList.toggle('hidden', mode !== 'private');
    chatMessages.innerHTML = '';
    if (mode === 'public') loadHistory();
    else loadPrivateHistory();
  }

  privateRecipientSelect.addEventListener('change', () => {
    privateRecipient = privateRecipientSelect.value || null;
    if (privateRecipient) loadPrivateHistory();
  });

  async function loadParticipants() {
    try {
      const res = await fetch(api('participants'));
      const users = await res.json();
      privateRecipientSelect.innerHTML = '<option value="">Select participant…</option>';
      users.forEach((u) => {
        if (u.participantNumber === chatUser.participantNumber) return;
        const opt = document.createElement('option');
        opt.value = u.participantNumber;
        opt.textContent = `${u.fullName} (#${u.participantNumber})`;
        opt.dataset.name = u.fullName;
        privateRecipientSelect.appendChild(opt);
      });
    } catch (err) { console.error('Failed to load participants'); }
  }

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text && !chatFileInput.files.length) return;
    if (!chatUser) return;

    if (chatMode === 'private') {
      if (!privateRecipient) {
        showUploadError('Select a recipient for private message');
        return;
      }
      const opt = privateRecipientSelect.selectedOptions[0];
      socket.emit('private-message', {
        fromParticipantNumber: chatUser.participantNumber,
        fromFullName: chatUser.fullName,
        toParticipantNumber: privateRecipient,
        toFullName: opt.dataset.name || privateRecipient,
        text
      });
    } else {
      socket.emit('chat-message', {
        participantNumber: chatUser.participantNumber,
        fullName: chatUser.fullName,
        text
      });
    }

    chatInput.value = '';
    if (navigator.vibrate) navigator.vibrate(20);
  }

  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  chatAttachBtn.addEventListener('click', () => chatFileInput.click());

  chatFileInput.addEventListener('change', async () => {
    const file = chatFileInput.files[0];
    if (!file || !chatUser) return;
    chatFileInput.value = '';

    if (chatMode === 'private' && !privateRecipient) {
      showUploadError('Select a recipient before sending media');
      return;
    }

    hideUploadError();
    chatAttachBtn.disabled = true;

    const formData = new FormData();
    formData.append('media', file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(api('chat/upload'), {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        showUploadError('Video upload failed, please check your network connection');
        return;
      }

      const data = await res.json();
      const payload = {
        text: chatInput.value.trim(),
        mediaFilename: data.filename,
        mediaType: data.mediaType
      };

      if (chatMode === 'private') {
        const opt = privateRecipientSelect.selectedOptions[0];
        socket.emit('private-message', {
          fromParticipantNumber: chatUser.participantNumber,
          fromFullName: chatUser.fullName,
          toParticipantNumber: privateRecipient,
          toFullName: opt.dataset.name || privateRecipient,
          ...payload
        });
      } else {
        socket.emit('chat-message', {
          participantNumber: chatUser.participantNumber,
          fullName: chatUser.fullName,
          ...payload
        });
      }

      chatInput.value = '';
    } catch (err) {
      clearTimeout(timeoutId);
      showUploadError('Video upload failed, please check your network connection');
    } finally {
      chatAttachBtn.disabled = false;
    }
  });

  function showUploadError(msg) {
    chatUploadError.textContent = msg;
    chatUploadError.classList.remove('hidden');
    setTimeout(hideUploadError, 5000);
  }

  function hideUploadError() {
    chatUploadError.classList.add('hidden');
    chatUploadError.textContent = '';
  }

  socket.on('chat-message', (msg) => {
    if (chatMode !== 'public') return;
    appendPublicMessage(msg);
    if (!chatVisible) bumpUnread();
  });

  socket.on('private-message', (msg) => {
    if (chatMode !== 'private') return;
    const involved = msg.fromParticipantNumber === chatUser.participantNumber ||
      msg.toParticipantNumber === chatUser.participantNumber;
    if (!involved) return;
    if (privateRecipient &&
        !((msg.fromParticipantNumber === chatUser.participantNumber && msg.toParticipantNumber === privateRecipient) ||
          (msg.toParticipantNumber === chatUser.participantNumber && msg.fromParticipantNumber === privateRecipient))) {
      return;
    }
    appendPrivateMessage(msg);
    if (!chatVisible) bumpUnread();
  });

  function bumpUnread() {
    unreadCount++;
    chatBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    chatBadge.classList.remove('hidden');
  }

  function appendPublicMessage(msg) {
    const isSelf = chatUser && msg.participantNumber === chatUser.participantNumber;
    appendMessageEl(msg, isSelf, msg.fullName, `#${msg.participantNumber}`);
  }

  function appendPrivateMessage(msg) {
    const isSelf = chatUser && msg.fromParticipantNumber === chatUser.participantNumber;
    const sender = isSelf ? 'You' : msg.fromFullName;
    const label = isSelf ? `→ ${msg.toFullName}` : `#${msg.fromParticipantNumber}`;
    appendMessageEl(msg, isSelf, sender, label);
  }

  function appendMessageEl(msg, isSelf, sender, sub) {
    const el = document.createElement('div');
    el.className = `chat-msg${isSelf ? ' self' : ''}`;
    const time = new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let mediaHtml = '';
    if (msg.mediaFilename) {
      const src = url('uploads/' + msg.mediaFilename);
      if (msg.mediaType === 'video') {
        mediaHtml = `<div class="msg-media"><video src="${src}" controls playsinline preload="metadata"></video></div>`;
      } else {
        mediaHtml = `<div class="msg-media"><img src="${src}" alt="Shared media" loading="lazy"></div>`;
      }
    }

    el.innerHTML = `
      <div class="msg-sender">${escapeHtml(sender)} ${escapeHtml(sub)}</div>
      ${msg.text ? `<div class="msg-text">${escapeHtml(msg.text)}</div>` : ''}
      ${mediaHtml}
      <div class="msg-time">${time}</div>
    `;
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  async function loadHistory() {
    try {
      const res = await fetch(api('messages'));
      const messages = await res.json();
      chatMessages.innerHTML = '';
      messages.forEach(appendPublicMessage);
    } catch (err) { console.error('Failed to load chat history'); }
  }

  async function loadPrivateHistory() {
    if (!chatUser || !privateRecipient) return;
    try {
      const res = await fetch(api('private-messages/' + encodeURIComponent(chatUser.participantNumber)));
      const messages = await res.json();
      chatMessages.innerHTML = '';
      messages
        .filter((m) =>
          (m.fromParticipantNumber === chatUser.participantNumber && m.toParticipantNumber === privateRecipient) ||
          (m.toParticipantNumber === chatUser.participantNumber && m.fromParticipantNumber === privateRecipient)
        )
        .forEach(appendPrivateMessage);
    } catch (err) { console.error('Failed to load private messages'); }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
