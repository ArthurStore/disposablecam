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
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  let chatUser = null;
  let unreadCount = 0;
  let chatVisible = false;
  let chatMode = 'public';
  let privateRecipient = null;
  let privateRecipientName = '';
  let participantsCache = [];
  let participantLoadPending = false;
  let recoveryInProgress = false;
  let incognitoDetected = false;
  const dmUnread = new Map();
  const dmConversations = new Map();
  const dmOpenTabs = new Set();
  const dmTabOrder = [];

  function normPn(n) {
    if (n == null) return '';
    return String(n).trim();
  }
  function isSameParticipant(a, b) {
    return normPn(a) === normPn(b);
  }
  function getTotalDmUnread() {
    let t = 0;
    dmUnread.forEach((c) => { t += c; });
    return t;
  }

  // Detect incognito/private browsing mode
  function detectIncognito() {
    return new Promise((resolve) => {
      const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
      if (!fs) {
        incognitoDetected = true;
        resolve(true);
        return;
      }
      fs(window.TEMPORARY, 100, () => resolve(false), () => {
        incognitoDetected = true;
        resolve(true);
      });
    });
  }

  // Silent auto-recovery routine for non-incognito sessions
  async function performAutoRecovery() {
    if (recoveryInProgress || incognitoDetected) return false;
    recoveryInProgress = true;

    try {
      const chatKeys = Object.keys(localStorage).filter(k =>
        k.startsWith('chat_') || k.includes('session') || k.includes('socket')
      );
      chatKeys.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {
          console.error('Session recovery storage clear failed:', e);
        }
      });

      if (socket.connected) {
        socket.disconnect();
        await new Promise(r => setTimeout(r, 200));
      }
      socket.connect();

      await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(), 2000);
        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      if (chatUser) loadParticipants();
      return true;
    } catch (e) {
      return false;
    } finally {
      recoveryInProgress = false;
    }
  }

  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatBadge = document.getElementById('chat-badge');
  const chatPrivateBadge = document.getElementById('chat-private-badge');
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
  const dmSelect = document.getElementById('dm-select');
  const dmParticipantList = document.getElementById('dm-participant-list');
  const dmSelectedDisplay = document.getElementById('dm-selected-display');
  const dmSelectedLabel = document.getElementById('dm-selected-label');
  const dmChangeRecipient = document.getElementById('dm-change-recipient');
  const dmConvoTabs = document.getElementById('dm-convo-tabs');
  const chatAttachBtn = document.getElementById('chat-attach-btn');
  const chatUploadError = document.getElementById('chat-upload-error');
  const chatGalleryPicker = document.getElementById('chat-gallery-picker');
  const chatPickerGrid = document.getElementById('chat-picker-grid');
  const chatPickerEmpty = document.getElementById('chat-picker-empty');
  const chatPickerClose = document.getElementById('chat-picker-close');

  async function fetchWithRetry(path, retries) {
    let lastErr;
    // 'reload' bypasses both HTTP cache and SW cache, forces network request
    const cacheBust = '?_t=' + Date.now();
    for (let i = 0; i <= (retries || 3); i++) {
      try {
        const res = await fetch(api(path) + cacheBust, { cache: 'reload' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res;
      } catch (e) {
        lastErr = e;
        if (i < (retries || 3)) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    throw lastErr;
  }

  window.initChat = function (user) {
    chatUser = user;
    loadParticipants();
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
      else {
        loadParticipants();
        if (privateRecipient) {
          showDmRecipientPicked(privateRecipientName, privateRecipient);
          loadPrivateHistory(true);
        } else {
          showDmRecipientPicker();
        }
      }
      scrollToBottom();
      if (window.pushAppOverlay) window.pushAppOverlay(closeChatPanel);
    } else if (window.dismissAppOverlay) {
      window.dismissAppOverlay(closeChatPanel);
    }
  });

  chatCloseBtn.addEventListener('click', () => {
    if (window.dismissAppOverlay) window.dismissAppOverlay(closeChatPanel);
    else closeChatPanel();
  });

  window.closeChatPanel = function () {
    chatVisible = false;
    chatPanel.classList.remove('visible');
    chatPanel.classList.add('hidden');
  };

  window.isChatOpen = function () {
    return chatVisible;
  };

  chatTabPublic.addEventListener('click', () => switchChatMode('public'));
  chatTabPrivate.addEventListener('click', () => switchChatMode('private'));

  function switchChatMode(mode) {
    chatMode = mode;
    chatTabPublic.classList.toggle('active', mode === 'public');
    chatTabPrivate.classList.toggle('active', mode === 'private');
    privateRecipientBar.classList.toggle('hidden', mode !== 'private');
    if (mode !== 'private') privateRecipientBar.classList.remove('recipient-picked');
    chatMessages.innerHTML = '';
    hideUploadError();
    if (mode === 'public') {
      loadHistory(true);
    } else {
      renderDmConvoTabs();
      loadParticipants();
      if (privateRecipient) {
        showDmRecipientPicked(privateRecipientName, privateRecipient);
        loadPrivateHistory(true);
      } else {
        showDmRecipientPicker();
      }
    }
    updateDmTabsVisibility();
  }

  function updatePrivateTabBadge() {
    if (!chatPrivateBadge) return;
    const total = getTotalDmUnread();
    if (total > 0) {
      chatPrivateBadge.textContent = total > 99 ? '99+' : total;
      chatPrivateBadge.classList.remove('hidden');
    } else {
      chatPrivateBadge.classList.add('hidden');
    }
  }

  function updateDmTabsVisibility() {
    if (dmConvoTabs) dmConvoTabs.classList.toggle('visible', dmOpenTabs.size > 0);
  }

  function getDmUnread(num) {
    return dmUnread.get(String(num)) || 0;
  }

  function setDmUnread(num, count) {
    const key = String(num);
    if (count <= 0) dmUnread.delete(key);
    else dmUnread.set(key, count);
    renderDmConvoTabs();
    renderParticipantList(participantsCache);
    updatePrivateTabBadge();
  }

  function bumpDmUnread(num) {
    setDmUnread(num, getDmUnread(num) + 1);
  }

  function clearDmUnread(num) {
    setDmUnread(num, 0);
  }

  function openDmTab(num, name) {
    const key = String(num);
    ensureDmConversation(key, name);
    if (!dmOpenTabs.has(key)) {
      dmOpenTabs.add(key);
      dmTabOrder.push(key);
    }
    renderDmConvoTabs();
    updateDmTabsVisibility();
  }

  function closeDmTab(num, e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const key = String(num);
    dmOpenTabs.delete(key);
    const idx = dmTabOrder.indexOf(key);
    if (idx >= 0) dmTabOrder.splice(idx, 1);
    if (isSameParticipant(privateRecipient, key)) {
      privateRecipient = null;
      privateRecipientName = '';
      privateRecipientInput.value = '';
      chatMessages.innerHTML = '';
      showDmRecipientPicker();
    }
    renderDmConvoTabs();
    updateDmTabsVisibility();
  }

  function ensureDmConversation(num, name) {
    const key = String(num);
    if (!dmConversations.has(key)) {
      dmConversations.set(key, { num: key, name: name || key, unread: 0 });
    } else if (name) {
      dmConversations.get(key).name = name;
    }
    return dmConversations.get(key);
  }

  function renderDmConvoTabs() {
    if (!dmConvoTabs || !chatUser) return;
    dmConvoTabs.innerHTML = '';
    if (!dmOpenTabs.size) return;

    dmTabOrder.filter((key) => dmOpenTabs.has(key)).forEach((key) => {
      const convo = dmConversations.get(key);
      if (!convo) return;

      const tab = document.createElement('div');
      tab.className = 'dm-convo-tab' + (isSameParticipant(privateRecipient, key) ? ' active' : '');
      tab.setAttribute('role', 'button');
      tab.tabIndex = 0;

      const label = document.createElement('span');
      label.className = 'dm-tab-label';
      const shortName = (convo.name || '').split(' ')[0] || key;
      label.textContent = shortName;
      tab.appendChild(label);

      const unread = getDmUnread(key);
      if (unread > 0) {
        const badge = document.createElement('span');
        badge.className = 'dm-unread-badge';
        badge.textContent = unread > 99 ? '99+' : unread;
        tab.appendChild(badge);
      }

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'dm-tab-close';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => closeDmTab(key, e));
      tab.appendChild(closeBtn);

      tab.addEventListener('click', () => {
        const u = participantsCache.find((p) => p.participantNumber === key);
        const btnEl = dmParticipantList.querySelector(`[data-num="${key}"]`);
        selectRecipient(key, u ? u.fullName : convo.name, btnEl);
      });

      dmConvoTabs.appendChild(tab);
    });
  }

  function showDmRecipientPicked(name, num) {
    privateRecipientBar.classList.add('recipient-picked');
    if (dmSelectedLabel) dmSelectedLabel.textContent = `${name} (#${num})`;
    if (dmSearch) dmSearch.value = '';
  }

  function showDmRecipientPicker() {
    privateRecipientBar.classList.remove('recipient-picked');
    if (dmSelect) dmSelect.value = '';
  }

  if (dmChangeRecipient) {
    dmChangeRecipient.addEventListener('click', () => {
      showDmRecipientPicker();
      if (dmSearch) dmSearch.focus();
    });
  }

  // Search bar filters the list
  if (dmSearch) {
    dmSearch.addEventListener('input', () => {
      const q = dmSearch.value.trim().toLowerCase();
      dmParticipantList.querySelectorAll('.dm-participant-item').forEach((el) => {
        const name = (el.dataset.name || '').toLowerCase();
        const num = (el.dataset.num || '').toLowerCase();
        el.classList.toggle('hidden-by-search', q.length > 0 && !name.includes(q) && !num.includes(q));
      });
    });
  }

  // Dropdown select handler
  if (dmSelect) {
    dmSelect.addEventListener('change', () => {
      const val = dmSelect.value;
      if (!val) return;
      const u = participantsCache.find((p) => p.participantNumber === val);
      if (!u) return;
      const matchingBtn = dmParticipantList.querySelector(`[data-num="${val}"]`);
      selectRecipient(u.participantNumber, u.fullName, matchingBtn);
    });
  }

  async function loadParticipants() {
    // Always render from cache immediately so the UI never appears empty
    if (participantsCache.length) renderParticipantList(participantsCache);
    if (participantLoadPending) return;
    participantLoadPending = true;
    try {
      const res = await fetchWithRetry('participants');
      const data = await res.json();
      if (Array.isArray(data) && data.length >= 0) {
        participantsCache = data;
        renderParticipantList(data);
      }
    } catch (err) {
      if (!participantsCache.length) {
        showUploadError('Could not load participants — tap Private again to retry');
      }
    } finally {
      participantLoadPending = false;
    }
  }

  function renderParticipantList(users) {
    if (!chatUser) return;
    const prev = privateRecipient;
    const filtered = users.filter((u) => !isSameParticipant(u.participantNumber, chatUser.participantNumber));

    // Update list buttons
    dmParticipantList.innerHTML = '';
    filtered.forEach((u) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dm-participant-item' + (u.participantNumber === prev ? ' selected' : '');
      btn.dataset.num = u.participantNumber;
      btn.dataset.name = u.fullName;
      const unread = getDmUnread(u.participantNumber);
      btn.innerHTML = `<span>${escapeHtml(u.fullName)} (#${escapeHtml(u.participantNumber)})</span>` +
        (unread > 0 ? `<span class="dm-unread-badge">${unread > 99 ? '99+' : unread}</span>` : '');
      btn.addEventListener('click', () => selectRecipient(u.participantNumber, u.fullName, btn));
      dmParticipantList.appendChild(btn);
    });

    // Update dropdown
    if (dmSelect) {
      const current = dmSelect.value;
      dmSelect.innerHTML = '<option value="">— Select recipient —</option>';
      filtered.forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.participantNumber;
        opt.textContent = `${u.fullName} (#${u.participantNumber})`;
        if (u.participantNumber === current) opt.selected = true;
        dmSelect.appendChild(opt);
      });
      if (prev && dmSelect.value !== prev) dmSelect.value = prev;
    }
  }

  function selectRecipient(num, name, btnEl) {
    privateRecipient = normPn(num);
    privateRecipientName = name;
    privateRecipientInput.value = num;
    openDmTab(num, name);

    dmParticipantList.querySelectorAll('.dm-participant-item').forEach((el) => {
      el.classList.toggle('selected', el === btnEl);
    });
    if (dmSelect && dmSelect.value !== num) dmSelect.value = num;

    clearDmUnread(num);
    showDmRecipientPicked(name, num);
    renderDmConvoTabs();
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
      openDmTab(privateRecipient, privateRecipientName);
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
  chatPickerClose.addEventListener('click', () => {
    if (window.dismissAppOverlay) window.dismissAppOverlay(() => chatGalleryPicker.classList.add('hidden'));
    else chatGalleryPicker.classList.add('hidden');
  });

  async function openGalleryPicker() {
    if (!chatUser) return;
    if (chatMode === 'private' && !privateRecipient) {
      showUploadError('Select a recipient before sharing media');
      return;
    }
    chatGalleryPicker.classList.remove('hidden');
    if (window.pushAppOverlay) window.pushAppOverlay(() => chatGalleryPicker.classList.add('hidden'));
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
      showUploadError('Share failed — check your connection');
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
    if (!chatUser) return;
    if (chatMode === 'public') loadHistory(true);
    else {
      loadParticipants();
      if (privateRecipient) loadPrivateHistory(true);
    }
  });

  socket.on('chat-message', (msg) => {
    if (chatMode === 'public' && chatVisible) appendPublicMessage(msg);
    if (!chatVisible || chatMode !== 'public') bumpUnread();
  });

  socket.on('private-message', (msg) => {
    if (!chatUser) return;
    const myNum = normPn(chatUser.participantNumber);
    const fromNum = normPn(msg.fromParticipantNumber);
    const toNum = normPn(msg.toParticipantNumber);
    if (fromNum !== myNum && toNum !== myNum) return;

    const fromSelf = fromNum === myNum;
    const otherNum = fromSelf ? toNum : fromNum;
    const otherName = fromSelf ? msg.toFullName : msg.fromFullName;

    openDmTab(otherNum, otherName);
    updateDmTabsVisibility();

    const viewingConvo = chatVisible && chatMode === 'private' && isSameParticipant(privateRecipient, otherNum);

    if (viewingConvo) {
      appendPrivateMessage(msg);
    } else if (!fromSelf) {
      bumpDmUnread(otherNum);
      bumpUnread();
      if (typeof window.showMicroToast === 'function') {
        window.showMicroToast('DM dari ' + (otherName || otherNum).split(' ')[0]);
      }
    }
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
    const isSelf = chatUser && isSameParticipant(msg.fromParticipantNumber, chatUser.participantNumber);
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
      <div class="msg-sender">${escapeHtml(sender)} <span class="msg-sub">${escapeHtml(sub)}</span></div>
      ${msg.text ? `<div class="msg-text">${escapeHtml(msg.text)}</div>` : ''}
      ${mediaHtml}
      <div class="msg-time">${time}</div>
    `;
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  async function loadHistory(force) {
    // Set up 3-second timeout for auto-recovery trigger
    const timeoutId = setTimeout(async () => {
      if (!incognitoDetected) {
        await detectIncognito();
      }
      if (!incognitoDetected) {
        const recovered = await performAutoRecovery();
        if (recovered) {
          try {
            const res = await fetchWithRetry('messages', 1);
            const messages = await res.json();
            chatMessages.innerHTML = '';
            messages.forEach(appendPublicMessage);
            if (chatUser) loadParticipants();
            return;
          } catch (e) {}
        }
      }
      if (chatMessages.children.length === 0) {
        showUploadError('Chat history unavailable — reconnecting…');
      }
    }, 3000);

    try {
      const res = await fetchWithRetry('messages', 3);
      clearTimeout(timeoutId);
      const messages = await res.json();
      chatMessages.innerHTML = '';
      messages.forEach(appendPublicMessage);
    } catch (err) {
      clearTimeout(timeoutId);
      if (chatMessages.children.length === 0) {
        showUploadError('Chat history unavailable — reconnecting…');
      }
    }
  }

  async function loadPrivateHistory() {
    if (!chatUser || !privateRecipient) return;
    try {
      const res = await fetchWithRetry('private-messages/' + encodeURIComponent(chatUser.participantNumber), 3);
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
    div.textContent = String(str || '');
    return div.innerHTML;
  }
})();
