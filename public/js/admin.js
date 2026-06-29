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

  const usersTbody = document.getElementById('users-tbody');
  const rosterSearch = document.getElementById('roster-search');
  const rosterTotal = document.getElementById('roster-total');
  const adminChatFeed = document.getElementById('admin-chat-feed');
  const adminPrivateFeed = document.getElementById('admin-private-feed');

  let allUsers = [];
  let presenceMap = new Map();
  let rosterGenderFilter = 'all';
  let rosterConnFilter = 'all';

  const evtName = document.getElementById('evt-name');
  const evtSubtitle = document.getElementById('evt-subtitle');
  const evtSlug = document.getElementById('evt-slug');
  const evtDays = document.getElementById('evt-days');
  const evtStart = document.getElementById('evt-start');
  const evtEnd = document.getElementById('evt-end');
  const evtCoverFile = document.getElementById('evt-cover-file');
  const evtCoverPreview = document.getElementById('evt-cover-preview');
  const evtRecapCoverFile = document.getElementById('evt-recap-cover-file');
  const evtRecapCoverPreview = document.getElementById('evt-recap-cover-preview');
  const evtSaveBtn = document.getElementById('evt-save-btn');
  const evtResult = document.getElementById('evt-result');
  const recapUrlHint = document.getElementById('recap-url-hint');
  const recapLink = document.getElementById('recap-link');
  const resetEventBtn = document.getElementById('reset-event-btn');
  const resetResult = document.getElementById('reset-result');

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
    loadPresence();
    loadEventConfig();
    loadChatMonitor();
    loadPrivateMonitor();
    initAdminSocket();
    setInterval(loadStats, 10000);
    setInterval(loadSystem, 5000);
    setInterval(loadPresence, 15000);
  }

  async function loadPresence() {
    try {
      const res = await fetch(api('admin/presence'));
      if (!res.ok) return;
      const list = await res.json();
      applyPresenceList(list);
    } catch (err) {}
  }

  function applyPresenceList(list) {
    presenceMap.clear();
    (list || []).forEach((p) => {
      const key = String(p.participantNumber || '').trim();
      if (key) presenceMap.set(key, p);
    });
    renderUsersTable();
  }

  function normPn(n) {
    return String(n == null ? '' : n).trim();
  }

  function isUserOnline(u) {
    return presenceMap.has(normPn(u.participantNumber));
  }

  function getUserDevice(u) {
    const entry = presenceMap.get(normPn(u.participantNumber));
    return entry && entry.device ? entry.device : null;
  }

  function formatDeviceLabel(device) {
    if (!device) return '—';
    const parts = [];
    if (device.os && device.os !== 'Unknown') {
      let osLine = device.os;
      if (device.osVersion) osLine += ' ' + device.osVersion;
      parts.push(osLine);
    }
    const hardware = [device.brand, device.model].filter(Boolean).join(' ').trim();
    if (hardware) parts.push(hardware);
    return parts.length ? parts.join(' · ') : '—';
  }

  function renderConnectionStatus(u) {
    if (u.isBanned) {
      return '<span class="status-banned">Banned</span>';
    }
    if (isUserOnline(u)) {
      return '<span class="status-online"><span class="status-dot online"></span>Online</span>';
    }
    return '<span class="status-offline"><span class="status-dot offline"></span>Offline</span>';
  }

  async function loadEventConfig() {
    try {
      const res = await fetch(api('admin/event-config'));
      const cfg = await res.json();
      evtName.value = cfg.eventName || '';
      evtSubtitle.value = cfg.eventSubtitle || '';
      evtSlug.value = cfg.recapSlug || 'moments';
      evtDays.value = cfg.eventDays || 1;
      if (cfg.eventStartDate) evtStart.value = cfg.eventStartDate.slice(0, 10);
      if (cfg.eventEndDate) evtEnd.value = cfg.eventEndDate.slice(0, 10);
      if (cfg.coverImage) {
        evtCoverPreview.style.backgroundImage = `url('${url('uploads/' + cfg.coverImage)}')`;
      }
      const recapCover = cfg.recapCoverImage || cfg.coverImage;
      if (recapCover) {
        evtRecapCoverPreview.style.backgroundImage = `url('${url('uploads/' + recapCover)}')`;
      }
      const slug = cfg.recapSlug || 'moments';
      recapLink.href = 'recap/' + slug;
      recapUrlHint.textContent = `Recap album URL: …/recap/${slug}`;
    } catch (err) {}
  }

  function cropImageTo9x16(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const targetRatio = 9 / 16;
        const srcRatio = srcW / srcH;
        let cropW, cropH, sx, sy;
        if (srcRatio > targetRatio) {
          cropH = srcH;
          cropW = Math.round(srcH * targetRatio);
          sx = Math.round((srcW - cropW) / 2);
          sy = 0;
        } else {
          cropW = srcW;
          cropH = Math.round(srcW / targetRatio);
          sx = 0;
          sy = Math.round((srcH - cropH) / 2);
        }
        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 1280;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) reject(new Error('Crop failed'));
          else resolve(blob);
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        reject(new Error('Image load failed'));
      };
      img.src = objUrl;
    });
  }

  function cropImageTo16x9(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const targetRatio = 16 / 9;
        const srcRatio = srcW / srcH;
        let cropW, cropH, sx, sy;
        if (srcRatio > targetRatio) {
          cropH = srcH;
          cropW = Math.round(srcH * targetRatio);
          sx = Math.round((srcW - cropW) / 2);
          sy = 0;
        } else {
          cropW = srcW;
          cropH = Math.round(srcW / targetRatio);
          sx = 0;
          sy = Math.round((srcH - cropH) / 2);
        }
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) reject(new Error('Crop failed'));
          else resolve(blob);
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        reject(new Error('Image load failed'));
      };
      img.src = objUrl;
    });
  }

  evtSaveBtn.addEventListener('click', async () => {
    evtSaveBtn.disabled = true;
    try {
      const res = await fetch(api('admin/event-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: evtName.value,
          eventSubtitle: evtSubtitle.value,
          recapSlug: evtSlug.value,
          eventDays: parseInt(evtDays.value, 10),
          eventStartDate: evtStart.value,
          eventEndDate: evtEnd.value
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(evtResult, data.error || 'Save failed', 'error');
        return;
      }
      if (evtCoverFile.files[0]) {
        const croppedWelcome = await cropImageTo9x16(evtCoverFile.files[0]);
        const fd = new FormData();
        fd.append('cover', croppedWelcome, 'welcome-cover-9x16.jpg');
        const coverRes = await fetch(api('admin/event-cover'), { method: 'POST', body: fd });
        const coverData = await coverRes.json();
        if (coverRes.ok && coverData.coverImage) {
          evtCoverPreview.style.backgroundImage = `url('${url('uploads/' + coverData.coverImage)}')`;
        }
        evtCoverFile.value = '';
      }
      if (evtRecapCoverFile.files[0]) {
        const cropped = await cropImageTo16x9(evtRecapCoverFile.files[0]);
        const fd = new FormData();
        fd.append('cover', cropped, 'recap-cover-16x9.jpg');
        const recapRes = await fetch(api('admin/event-recap-cover'), { method: 'POST', body: fd });
        const recapData = await recapRes.json();
        if (recapRes.ok && recapData.recapCoverImage) {
          evtRecapCoverPreview.style.backgroundImage = `url('${url('uploads/' + recapData.recapCoverImage)}')`;
        }
        evtRecapCoverFile.value = '';
      }
      setResult(evtResult, 'Event settings saved', 'success');
      loadEventConfig();
    } catch (err) {
      setResult(evtResult, 'Connection error', 'error');
    } finally {
      evtSaveBtn.disabled = false;
    }
  });

  if (resetEventBtn) {
    resetEventBtn.addEventListener('click', async () => {
      if (!confirm('RESET ALL? This permanently deletes all photos, videos, and chat messages. Participants are kept. This cannot be undone.')) return;
      if (!confirm('Are you absolutely sure? This action is irreversible.')) return;
      resetEventBtn.disabled = true;
      try {
        const res = await fetch(api('admin/reset-event'), { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setResult(resetResult, 'All media and chat wiped successfully', 'success');
          loadStats();
        } else {
          setResult(resetResult, data.error || 'Reset failed', 'error');
        }
      } catch (err) {
        setResult(resetResult, 'Connection error', 'error');
      } finally {
        resetEventBtn.disabled = false;
      }
    });
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

    adminSocket.on('presence-update', (list) => {
      applyPresenceList(list);
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

  // ─── Add User Modal ───
  function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.admin-modal').forEach((modal) => {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal.id); });
  });

  const openAddUserBtn = document.getElementById('open-add-user-modal');
  if (openAddUserBtn) openAddUserBtn.addEventListener('click', () => {
    ['mu-fullname','mu-nickname','mu-email','mu-password','mu-dob'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const g = document.getElementById('mu-gender'); if (g) g.value = '';
    const err = document.getElementById('mu-error'); if (err) err.textContent = '';
    openModal('modal-add-user');
  });

  const submitAddUser = document.getElementById('submit-add-user');
  if (submitAddUser) submitAddUser.addEventListener('click', async () => {
    const fullName = (document.getElementById('mu-fullname').value || '').trim();
    const nickname = (document.getElementById('mu-nickname').value || '').trim();
    const gender = document.getElementById('mu-gender').value;
    const dateOfBirth = document.getElementById('mu-dob').value;
    const email = (document.getElementById('mu-email').value || '').trim();
    const password = document.getElementById('mu-password').value;
    const errEl = document.getElementById('mu-error');
    if (!fullName || !gender || !email || !password) {
      if (errEl) errEl.textContent = 'Nama, gender, email, dan password wajib diisi';
      return;
    }
    submitAddUser.disabled = true; submitAddUser.textContent = 'Menyimpan…';
    try {
      const res = await fetch(api('admin/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, nickname, gender, dateOfBirth, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        closeModal('modal-add-user');
        loadUsers(); loadStats();
      } else {
        if (errEl) errEl.textContent = data.error || 'Gagal menambah user';
      }
    } catch (err) {
      if (errEl) errEl.textContent = 'Koneksi error';
    } finally {
      submitAddUser.disabled = false; submitAddUser.textContent = 'Simpan';
    }
  });

  // ─── Edit User Modal ───
  const submitEditUser = document.getElementById('submit-edit-user');
  if (submitEditUser) submitEditUser.addEventListener('click', async () => {
    const id = document.getElementById('eu-id').value;
    const fullName = (document.getElementById('eu-fullname').value || '').trim();
    const nickname = (document.getElementById('eu-nickname').value || '').trim();
    const gender = document.getElementById('eu-gender').value;
    const dateOfBirth = document.getElementById('eu-dob').value;
    const email = (document.getElementById('eu-email').value || '').trim();
    const password = document.getElementById('eu-password').value;
    const errEl = document.getElementById('eu-error');
    submitEditUser.disabled = true; submitEditUser.textContent = 'Menyimpan…';
    try {
      const body = { fullName, nickname, gender, dateOfBirth, email };
      if (password) body.password = password;
      const res = await fetch(api('admin/users/' + encodeURIComponent(id)), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        closeModal('modal-edit-user');
        loadUsers();
      } else {
        if (errEl) errEl.textContent = data.error || 'Gagal menyimpan';
      }
    } catch (err) {
      if (errEl) errEl.textContent = 'Koneksi error';
    } finally {
      submitEditUser.disabled = false; submitEditUser.textContent = 'Simpan';
    }
  });

  async function loadUsers() {
    try {
      const res = await fetch(api('admin/users'));
      allUsers = await res.json();
      renderUsersTable();
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  function formatGenderLabel(gender) {
    const g = (gender || '').toString().trim();
    if (g === 'L' || g.startsWith('Laki')) return 'Laki - Laki';
    if (g === 'P' || g.startsWith('Perempuan')) return 'Perempuan';
    return g || '—';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return '—'; }
  }

  function getFilteredUsers() {
    const q = (rosterSearch && rosterSearch.value || '').trim().toLowerCase();
    let list = [...allUsers];

    if (rosterGenderFilter !== 'all') {
      list = list.filter((u) => formatGenderLabel(u.gender) === rosterGenderFilter);
    }
    if (rosterConnFilter === 'online') {
      list = list.filter((u) => !u.isBanned && isUserOnline(u));
    } else if (rosterConnFilter === 'offline') {
      list = list.filter((u) => u.isBanned || !isUserOnline(u));
    }
    if (q) {
      list = list.filter((u) =>
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.nickname || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        String(u.participantNumber || '').includes(q)
      );
    }
    list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'id'));
    return list;
  }

  function renderUsersTable() {
    const users = getFilteredUsers();
    const onlineCount = allUsers.filter((u) => !u.isBanned && isUserOnline(u)).length;
    if (rosterTotal) {
      rosterTotal.textContent = `Total: ${allUsers.length} pengguna · Online: ${onlineCount}`;
    }
    usersTbody.innerHTML = '';

    if (!users.length) {
      usersTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-dim)">Tidak ada pengguna</td></tr>';
      return;
    }

    users.forEach((u, idx) => {
      const tr = document.createElement('tr');
      const genderLabel = formatGenderLabel(u.gender);
      const genderBadge = genderLabel === 'Laki - Laki' ? '♂ L' : '♀ P';
      const dobStr = u.dateOfBirth ? formatDate(u.dateOfBirth) : '—';
      const regStr = formatDate(u.registeredAt);
      tr.innerHTML = `
        <td class="num-cell">${String(idx + 1).padStart(2, '0')}</td>
        <td><strong>${escapeHtml(u.fullName || '—')}</strong><br><small style="color:var(--text-dim)">#${escapeHtml(u.participantNumber || '')}</small></td>
        <td>${escapeHtml(u.nickname || '—')}</td>
        <td class="email-cell">${escapeHtml(u.email || '—')}</td>
        <td>${genderBadge}</td>
        <td>${regStr}</td>
        <td>${renderConnectionStatus(u)}</td>
        <td class="action-cell">
          <button class="btn-edit-user" data-id="${u._id}" title="Edit">✏️</button>
          <button class="btn-ban ${u.isBanned ? 'unban' : 'ban'}" data-id="${u._id}">${u.isBanned ? 'Unban' : 'Ban'}</button>
          <button class="btn-delete" data-id="${u._id}">Hapus</button>
        </td>
      `;
      usersTbody.appendChild(tr);
    });

    usersTbody.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = allUsers.find((x) => x._id === btn.dataset.id);
        if (!u) return;
        document.getElementById('eu-id').value = u._id;
        document.getElementById('eu-fullname').value = u.fullName || '';
        document.getElementById('eu-nickname').value = u.nickname || '';
        document.getElementById('eu-gender').value = formatGenderLabel(u.gender);
        document.getElementById('eu-dob').value = u.dateOfBirth ? u.dateOfBirth.slice(0, 10) : '';
        document.getElementById('eu-email').value = u.email || '';
        document.getElementById('eu-password').value = '';
        const errEl = document.getElementById('eu-error'); if (errEl) errEl.textContent = '';
        openModal('modal-edit-user');
      });
    });

    usersTbody.querySelectorAll('.btn-ban').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await fetch(api('admin/users/' + encodeURIComponent(btn.dataset.id) + '/ban'), { method: 'PATCH' });
          if (res.ok) loadUsers();
        } catch (err) {}
      });
    });

    usersTbody.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr');
        const name = row.querySelector('strong') ? row.querySelector('strong').textContent : 'user ini';
        if (!confirm(`Hapus ${name}? Akses mereka akan langsung dicabut.`)) return;
        try {
          const res = await fetch(api('admin/users/' + encodeURIComponent(btn.dataset.id)), { method: 'DELETE' });
          if (res.ok) { loadUsers(); loadStats(); }
        } catch (err) {}
      });
    });
  }

  if (rosterSearch) rosterSearch.addEventListener('input', renderUsersTable);

  document.querySelectorAll('.roster-filter[data-gender]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.roster-filter[data-gender]').forEach((b) => b.classList.toggle('active', b === btn));
      rosterGenderFilter = btn.dataset.gender;
      renderUsersTable();
    });
  });

  document.querySelectorAll('.roster-filter[data-conn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.roster-filter[data-conn]').forEach((b) => b.classList.toggle('active', b === btn));
      rosterConnFilter = btn.dataset.conn;
      renderUsersTable();
    });
  });

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
