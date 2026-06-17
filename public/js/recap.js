(function () {
  'use strict';

  const BASE = (function () {
    const p = window.location.pathname.replace(/\/recap(\/[^/]*)?\/?$/, '/');
    return p.endsWith('/') ? p : p + '/';
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  const pathSlug = (function () {
    const m = window.location.pathname.match(/\/recap\/([^/]+)/);
    return m ? m[1] : null;
  })();

  let allPhotos = [];
  let currentModal = null;
  let viewMode = 'all';
  const heroBg = document.getElementById('hero-bg');
  const heroTitle = document.getElementById('hero-title');
  const heroSubtitle = document.getElementById('hero-subtitle');
  const statMoments = document.getElementById('stat-moments');
  const statDays = document.getElementById('stat-days');
  const statPeople = document.getElementById('stat-people');
  const tabAll = document.getElementById('tab-all');
  const tabPeople = document.getElementById('tab-people');
  const peoplePicker = document.getElementById('people-picker');
  const peopleSelect = document.getElementById('people-select');
  const grid = document.getElementById('recap-grid');
  const empty = document.getElementById('recap-empty');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContent = document.getElementById('modal-content');
  const modalClose = document.getElementById('modal-close');
  const modalDownload = document.getElementById('modal-download');

  tabAll.addEventListener('click', () => setView('all'));
  tabPeople.addEventListener('click', () => setView('people'));

  peopleSelect.addEventListener('change', () => renderGrid());

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  modalDownload.addEventListener('click', () => {
    if (!currentModal) return;
    const a = document.createElement('a');
    a.href = url('uploads/' + currentModal.filename);
    a.download = currentModal.originalName || currentModal.filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  function setView(mode) {
    viewMode = mode;
    tabAll.classList.toggle('active', mode === 'all');
    tabPeople.classList.toggle('active', mode === 'people');
    peoplePicker.classList.toggle('hidden', mode !== 'people');
    renderGrid();
  }

  async function loadRecap() {
    const res = await fetch(api('recap') + (pathSlug ? `?slug=${encodeURIComponent(pathSlug)}` : ''));
    if (!res.ok) {
      empty.classList.remove('hidden');
      empty.textContent = 'Album not found';
      return;
    }
    const data = await res.json();
    allPhotos = data.photos || [];

    if (data.event) {
      heroTitle.textContent = data.event.eventName || 'The Moments';
      heroSubtitle.textContent = data.event.eventSubtitle || '';
      if (data.event.coverImage) {
        heroBg.style.backgroundImage = `url('${url('uploads/' + data.event.coverImage)}')`;
      }
      document.title = data.event.eventName + ' — Recap';
    }

    if (data.stats) {
      statMoments.textContent = data.stats.moments;
      statDays.textContent = data.stats.days;
      statPeople.textContent = data.stats.people;
    }

    const pRes = await fetch(api('participants'));
    const participants = await pRes.json();
    peopleSelect.innerHTML = '<option value="">All people</option>';
    participants.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.participantNumber;
      opt.textContent = p.fullName;
      peopleSelect.appendChild(opt);
    });

    renderGrid();
  }

  function renderGrid() {
    let photos = allPhotos;
    if (viewMode === 'people' && peopleSelect.value) {
      photos = allPhotos.filter((p) => p.participantNumber === peopleSelect.value);
    }

    grid.innerHTML = '';
    if (!photos.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    photos.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'recap-item';
      const tag = (p.fullName || '').split(' ')[0].toUpperCase();

      if (p.fileType === 'video') {
        item.innerHTML = `<video src="${url('uploads/' + p.filename)}" muted preload="metadata"></video><span class="video-tag">▶</span>`;
      } else {
        item.innerHTML = `<img src="${url('uploads/' + p.filename)}" alt="" loading="lazy">`;
      }
      item.innerHTML += `<span class="name-tag">${escapeHtml(tag)}</span>`;
      item.addEventListener('click', () => openModal(p));
      grid.appendChild(item);
    });
  }

  function openModal(p) {
    currentModal = p;
    modalContent.innerHTML = '';
    if (p.fileType === 'video') {
      const v = document.createElement('video');
      v.src = url('uploads/' + p.filename);
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      modalContent.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + p.filename);
      modalContent.appendChild(img);
    }
    modalOverlay.classList.add('active');
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    modalContent.innerHTML = '';
    currentModal = null;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  loadRecap();
})();
