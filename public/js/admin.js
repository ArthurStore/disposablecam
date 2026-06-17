/* ═══════════════════════════════════════
   Disposable Camera — Admin Dashboard
   (subdir-safe relative paths)
   ═══════════════════════════════════════ */

/* globals io */

(function () {
  'use strict';

  const BASE = (function () {
    const p = window.location.pathname.replace(/\/admin\/?$/, '/');
    return p.endsWith('/') ? p : p + '/';
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  let isLoggedIn = false;
  let adminSocket = null;

  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const pinInput = document.getElementById('pin-input');
  const pinSubmit = document.getElementById('pin-submit');
  const pinError = document.getElementById('pin-error');
  const adminLogout = document.getElementById('admin-logout');

  const statUsers = document.getElementById('stat-users');
  const statUploads = document.getElementById('stat-uploads');
  const statPhotos = document.getElementById('stat-photos');
  const statVideos = document.getElementById('stat-videos');
  const statMessages = document.getElementById('stat-messages');

  const cpuBar = document.getElementById('cpu-bar');
  const cpuText = document.getElementById('cpu-text');
  const ramBar = document.getElementById('ram-bar');
  const ramText = document.getElementById('ram-text');
  const diskBar = document.getElementById('disk-bar');
  const diskText = document.getElementById('disk-text');
  const sysInfo = document.getElementById('sys-info');

  const importData = document.getElementById('import-data');
  const importBtn = document.getElementById('import-btn');
  const importResult = document.getElementById('import-result');

  const addNumber = document.getElementById('add-number');
  const addName = document.getElementById('add-name');
  const addGender = document.getElementById('add-gender');
  const addUserBtn = document.getElementById('add-user-btn');
  const addResult = document.getElementById('add-result');

  const usersTbody = document.getElementById('users-tbody');
  const adminChatFeed = document.getElementById('admin-chat-feed');
  const adminPrivateFeed = document.getElementById('admin-private-feed');

  pinSubmit.addEventListener('click', doLogin);
  pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

  async function doLogin() {
    const pin = pinInput.value.trim();
    if (!pin) { pinError.textContent = 'Enter a PIN'; return; }
    pinSubmit.disabled = true;
    try {
      const res = await fetch(api('admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) { pinError.textContent = data.error || 'Invalid PIN'; return; }

      isLoggedIn = true;
      loginScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
      loadDashboard();
    } catch (err) {
      pinError.textContent = 'Connection error';
    } finally {
      pinSubmit.disabled = false;
    }
  }

  adminLogout.addEventListener('click', () => {
    isLoggedIn = false;
    if (adminSocket) { adminSocket.disconnect(); adminSocket = null; }
    dashboard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    pinInput.value = '';
  });

  function loadDashboard() {
    loadStats();
    loadSystem();
    loadUsers();
    loadChatMonitor();
    loadPrivateMonitor();
    initAdminSocket();
    setInterval(loadStats, 10000);
    setInterval(loadSystem, 5000);
  }

  function initAdminSocket() {
    if (typeof io === 'undefined') return;
    adminSocket = io({ path: BASE + 'socket.io' });
    adminSocket.emit('join-admin');

    adminSocket.on('chat-message', (msg) => {
      appendAdminChatMsg(adminChatFeed, msg, 'public');
    });

    adminSocket.on('private-message', (msg) => {
      appendAdminChatMsg(adminPrivateFeed, msg, 'private');
    });
  }

  async function loadChatMonitor() {
    try {
      const res = await fetch(api('admin/messages'));
      const messages = await res.json();
      adminChatFeed.innerHTML = '';
      messages.forEach((m) => appendAdminChatMsg(adminChatFeed, m, 'public'));
    } catch (err) {}
  }

  async function loadPrivateMonitor() {
    try {
      const res = await fetch(api('admin/private-messages'));
      const messages = await res.json();
      adminPrivateFeed.innerHTML = '';
      messages.forEach((m) => appendAdminChatMsg(adminPrivateFeed, m, 'private'));
    } catch (err) {}
  }

  function appendAdminChatMsg(container, msg, type) {
    const el = document.createElement('div');
    el.className = 'admin-chat-msg';
    const time = new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let header, body = '';
    if (type === 'public') {
      header = `<strong>${escapeHtml(msg.fullName)}</strong> <span class="msg-meta">#${escapeHtml(msg.participantNumber)} · ${time}</span>`;
      body = msg.text ? escapeHtml(msg.text) : '';
    } else {
      header = `<strong>${escapeHtml(msg.fromFullName)}</strong> <span class="msg-meta">#${escapeHtml(msg.fromParticipantNumber)} → ${escapeHtml(msg.toFullName)} (#${escapeHtml(msg.toParticipantNumber)}) · ${time}</span>`;
      body = msg.text ? escapeHtml(msg.text) : '';
    }

    let mediaHtml = '';
    if (msg.mediaFilename) {
      const src = url('uploads/' + msg.mediaFilename);
      mediaHtml = msg.mediaType === 'video'
        ? `<div class="admin-msg-media"><video src="${src}" controls preload="metadata" style="max-width:120px;border-radius:6px"></video></div>`
        : `<div class="admin-msg-media"><img src="${src}" alt="" style="max-width:120px;border-radius:6px" loading="lazy"></div>`;
    }

    el.innerHTML = `<div class="admin-msg-header">${header}</div>${body ? `<div class="admin-msg-body">${body}</div>` : ''}${mediaHtml}`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  async function loadStats() {
    try {
      const res = await fetch(api('admin/stats'));
      const data = await res.json();
      statUsers.textContent = data.totalUsers;
      statUploads.textContent = data.totalUploads;
      statPhotos.textContent = data.totalPhotos;
      statVideos.textContent = data.totalVideos;
      statMessages.textContent = data.totalMessages;
    } catch (err) {}
  }

  async function loadSystem() {
    try {
      const res = await fetch(api('admin/system'));
      const data = await res.json();

      cpuBar.style.width = data.cpu + '%';
      cpuText.textContent = data.cpu + '%';
      ramBar.style.width = data.memory.percent + '%';
      ramText.textContent = `${data.memory.percent}% (${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)})`;
      diskBar.style.width = data.disk.percent + '%';
      diskText.textContent = `${data.disk.percent}% (${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)})`;

      setBarColor(cpuBar, data.cpu);
      setBarColor(ramBar, data.memory.percent);
      setBarColor(diskBar, data.disk.percent);

      const upHrs = Math.floor(data.uptime / 3600);
      const upMins = Math.floor((data.uptime % 3600) / 60);
      sysInfo.textContent = `${data.hostname} · ${data.platform} · Uptime: ${upHrs}h ${upMins}m`;
    } catch (err) {}
  }

  function setBarColor(el, percent) {
    if (percent > 80) el.style.background = '#ef4444';
    else if (percent > 60) el.style.background = '#f59e0b';
    else el.style.background = '#22c55e';
  }

  importBtn.addEventListener('click', async () => {
    const data = importData.value.trim();
    if (!data) { setResult(importResult, 'Paste participant data first', 'error'); return; }
    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';
    try {
      const res = await fetch(api('admin/import-participants'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      const result = await res.json();
      if (res.ok) {
        setResult(importResult, `Imported: ${result.imported}, Skipped: ${result.skipped}`, 'success');
        loadUsers(); loadStats();
      } else {
        setResult(importResult, result.error || 'Import failed', 'error');
      }
    } catch (err) {
      setResult(importResult, 'Connection error', 'error');
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = 'Import';
    }
  });

  addUserBtn.addEventListener('click', async () => {
    const num = addNumber.value.trim();
    const name = addName.value.trim();
    const gender = addGender.value;
    if (!num || !name) { setResult(addResult, 'Fill in all fields', 'error'); return; }
    try {
      const res = await fetch(api('admin/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantNumber: num, fullName: name, gender })
      });
      const data = await res.json();
      if (res.ok) {
        setResult(addResult, `Added: ${name} (#${num})`, 'success');
        addNumber.value = ''; addName.value = '';
        loadUsers(); loadStats();
      } else {
        setResult(addResult, data.error || 'Failed to add', 'error');
      }
    } catch (err) { setResult(addResult, 'Connection error', 'error'); }
  });

  async function loadUsers() {
    try {
      const res = await fetch(api('admin/users'));
      const users = await res.json();
      usersTbody.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(u.participantNumber)}</td>
          <td>${escapeHtml(u.fullName)}</td>
          <td>${u.gender === 'L' ? '♂ Male' : '♀ Female'}</td>
          <td><span class="${u.isBanned ? 'status-banned' : 'status-active'}">${u.isBanned ? 'Banned' : 'Active'}</span></td>
          <td class="action-cell">
            <button class="btn-ban ${u.isBanned ? 'unban' : 'ban'}" data-id="${u._id}">${u.isBanned ? 'Unban' : 'Ban'}</button>
            <button class="btn-delete" data-id="${u._id}">Delete</button>
          </td>
        `;
        usersTbody.appendChild(tr);
      });

      usersTbody.querySelectorAll('.btn-ban').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const res = await fetch(api('admin/users/' + encodeURIComponent(btn.dataset.id) + '/ban'), { method: 'PATCH' });
            if (res.ok) loadUsers();
          } catch (err) {}
        });
      });

      usersTbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('tr');
          const name = row.children[1].textContent;
          const num = row.children[0].textContent;
          if (!confirm(`Delete participant ${name} (#${num})? This revokes their access immediately.`)) return;
          try {
            const res = await fetch(api('admin/users/' + encodeURIComponent(btn.dataset.id)), { method: 'DELETE' });
            if (res.ok) { loadUsers(); loadStats(); }
          } catch (err) {}
        });
      });
    } catch (err) {}
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function setResult(el, text, type) {
    el.textContent = text;
    el.className = `result-text ${type}`;
    setTimeout(() => { el.textContent = ''; }, 5000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
