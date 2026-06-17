/* ═══════════════════════════════════════
   Disposable Camera — Real-Time Chat
   Public + Private messaging, gallery sharing
   ═══════════════════════════════════════ */

/* globals io, fetchUserGallery */

(function () {
  'use strict';

  const BASE = (function () {
    const p = window.location.pathname;
    return p.endsWith('/') ? p : p.replace(/\/[^/]*$/, '/');
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  const socket = io({
    path: BASE + 'socket.io',
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  let chatUser = null;
  let unreadCount = 0;
  let chatVisible = false;
  let chatMode = 'public';
  let privateRecipient = null;
  let privateRecipientName = '';
  let participantsCache = [];
  let historyLoaded = false;

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
  const privateRecipientInput = document.getElementById('private-recipient');
  const dmSearch = document.getElementById('dm-search');
  const dmParticipantList = document.getElementById('dm-participant-list');
  const chatAttachBtn = document.getElementById('chat-attach-btn');
  const chatUploadError = document.getElementById('chat-upload-error');
  const chatGalleryPicker = document.getElementById('chat-gallery-picker');
  const chatPickerGrid = document.getElementById('chat-picker-grid');
  const chatPickerEmpty = document.getElementById('chat-picker-empty');
  const chatPickerClose = document.getElementById('chat-picker-close');

  async function fetchWithRetry(path, retries) {
    let lastErr;
    for (let i = 0; i <= (retries || 2); i++) {
      try {
        const res = await fetch(api(path), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res;
      } catch (e) {
        lastErr = e;
        if (i < (retries || 2)) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    throw lastErr;
  }

  window.initChat = function (user) {
    chatUser = user;
    loadParticipants(true);
    loadHistory(true);
  };

  chatToggleBtn.addEventListener('click', () => {
    chatVisible = !chatVisible;
    chatPanel.classList.toggle('hidden', !chatVisible);
    chatPanel.classList.toggle('visible', chatVisible);
    if (chatVisible) {
      unreadCount = 0;
      chatBadge.classList.add('hidden');
      chatInput.focus();
      if (chatMode === 'public') loadHistory(true);
      else loadParticipants(true);
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
    hideUploadError();
    if (mode === 'public') loadHistory(true);
    else {
      loadParticipants(true);
      if (privateRecipient) loadPrivateHistory(true);
    }
  }

  dmSearch.addEventListener('input', () => {
    const q = dmSearch.value.trim().toLowerCase();
    dmParticipantList.querySelectorAll('.dm-participant-item').forEach((el) => {
      const name = (el.dataset.name || '').toLowerCase();
      const num = (el.dataset.num || '').toLowerCase();
      el.classList.toggle('hidden-by-search', q && !name.includes(q) && !num.includes(q));
    });
  });

  async function loadParticipants(force) {
    if (participantsCache.length && !force) {
      renderParticipantList(participantsCache);
      return;
    }
    try {
      const res = await fetchWithRetry('participants');
      participantsCache = await res.json();
      renderParticipantList(participantsCache);
    } catch (err) {
      if (participantsCache.length) renderParticipantList(participantsCache);
      else showUploadError('Could not load participants — tap Private again to retry');
    }
  }

  function renderParticipantList(users) {
    const prev = privateRecipient;
    dmParticipantList.innerHTML = '';
    users.forEach((u) => {
      if (u.participantNumber === chatUser.participantNumber) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dm-participant-item' + (u.participantNumber === prev ? ' selected' : '');
      btn.dataset.num = u.participantNumber;
      btn.dataset.name = u.fullName;
      btn.textContent = `${u.fullName} (#${u.participantNumber})`;
      btn.addEventListener('click', () => selectRecipient(u.participantNumber, u.fullName, btn));
      dmParticipantList.appendChild(btn);
    });
  }

  function selectRecipient(num, name, btnEl) {
    privateRecipient = num;
    privateRecipientName = name;
    privateRecipientInput.value = num;
    dmParticipantList.querySelectorAll('.dm-participant-item').forEach((el) => {
      el.classList.toggle('selected', el === btnEl);
    });
    loadPrivateHistory(true);
  }

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !chatUser) return;

    if (chatMode === 'private') {
      if (!privateRecipient) {
        showUploadError('Select a recipient for private message');
        return;
      }
      socket.emit('private-message', {
        fromParticipantNumber: chatUser.participantNumber,
        fromFullName: chatUser.fullName,
        toParticipantNumber: privateRecipient,
        toFullName: privateRecipientName,
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

  chatAttachBtn.addEventListener('click', () => openGalleryPicker());
  chatPickerClose.addEventListener('click', () => chatGalleryPicker.classList.add('hidden'));

  async function openGalleryPicker() {
    if (!chatUser) return;
    if (chatMode === 'private' && !privateRecipient) {
      showUploadError('Select a recipient before sharing media');
      return;
    }
    chatGalleryPicker.classList.remove('hidden');
    chatPickerGrid.innerHTML = '';
    try {
      const photos = typeof fetchUserGallery === 'function'
        ? await fetchUserGallery()
        : (await (await fetchWithRetry('gallery/' + encodeURIComponent(chatUser.participantNumber))).json());

      if (!photos.length) {
        chatPickerEmpty.classList.remove('hidden');
        return;
      }
      chatPickerEmpty.classList.add('hidden');

      photos.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'chat-picker-item';
        if (p.fileType === 'video') {
          item.innerHTML = `<video src="${url('uploads/' + p.filename)}" muted preload="metadata"></video>`;
        } else {
          item.innerHTML = `<img src="${url('uploads/' + p.filename)}" alt="" loading="lazy">`;
        }
        item.addEventListener('click', () => shareGalleryItem(p));
        chatPickerGrid.appendChild(item);
      });
    } catch (err) {
      chatPickerEmpty.classList.remove('hidden');
      chatPickerEmpty.textContent = 'Could not load your gallery';
    }
  }

  async function shareGalleryItem(photo) {
    chatGalleryPicker.classList.add('hidden');
    hideUploadError();
    chatAttachBtn.disabled = true;

    try {
      const shareRes = await fetch(api('chat/share-gallery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoId: photo._id,
          participantNumber: chatUser.participantNumber
        })
      });
      if (!shareRes.ok) throw new Error('Share failed');
      const data = await shareRes.json();
      const payload = {
        text: chatInput.value.trim(),
        mediaFilename: data.filename,
        mediaType: data.mediaType
      };

      if (chatMode === 'private') {
        socket.emit('private-message', {
          fromParticipantNumber: chatUser.participantNumber,
          fromFullName: chatUser.fullName,
          toParticipantNumber: privateRecipient,
          toFullName: privateRecipientName,
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
      showUploadError('Video upload failed, please check your network connection');
    } finally {
      chatAttachBtn.disabled = false;
    }
  }

  function showUploadError(msg) {
    chatUploadError.textContent = msg;
    chatUploadError.classList.remove('hidden');
    setTimeout(hideUploadError, 5000);
  }

  function hideUploadError() {
    chatUploadError.classList.add('hidden');
    chatUploadError.textContent = '';
  }

  socket.on('connect', () => {
    if (chatUser && chatVisible) {
      if (chatMode === 'public') loadHistory(true);
      else if (privateRecipient) loadPrivateHistory(true);
    }
  });

  socket.on('chat-message', (msg) => {
    if (chatMode === 'public') appendPublicMessage(msg);
    if (!chatVisible && chatMode === 'public') bumpUnread();
  });

  socket.on('private-message', (msg) => {
    if (!chatUser) return;
    const involved = msg.fromParticipantNumber === chatUser.participantNumber ||
      msg.toParticipantNumber === chatUser.participantNumber;
    if (!involved) return;
    if (chatMode === 'private') {
      if (privateRecipient &&
          !((msg.fromParticipantNumber === chatUser.participantNumber && msg.toParticipantNumber === privateRecipient) ||
            (msg.toParticipantNumber === chatUser.participantNumber && msg.fromParticipantNumber === privateRecipient))) {
        return;
      }
      appendPrivateMessage(msg);
    }
    if (!chatVisible && chatMode === 'private') bumpUnread();
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

  async function loadHistory(force) {
    if (historyLoaded && !force) return;
    try {
      const res = await fetchWithRetry('messages');
      const messages = await res.json();
      chatMessages.innerHTML = '';
      messages.forEach(appendPublicMessage);
      historyLoaded = true;
    } catch (err) {
      showUploadError('Chat history unavailable — reconnecting…');
    }
  }

  async function loadPrivateHistory(force) {
    if (!chatUser || !privateRecipient) return;
    try {
      const res = await fetchWithRetry('private-messages/' + encodeURIComponent(chatUser.participantNumber));
      const messages = await res.json();
      chatMessages.innerHTML = '';
      messages
        .filter((m) =>
          (m.fromParticipantNumber === chatUser.participantNumber && m.toParticipantNumber === privateRecipient) ||
          (m.toParticipantNumber === chatUser.participantNumber && m.fromParticipantNumber === privateRecipient)
        )
        .forEach(appendPrivateMessage);
    } catch (err) {
      showUploadError('Could not load conversation');
    }
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
