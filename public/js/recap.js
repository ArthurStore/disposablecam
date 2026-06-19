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

  let coverImageUrl = '';

  const heroBanner = document.getElementById('hero-banner');
  const heroBannerBg = document.getElementById('hero-banner-bg');
  const recapAmbient = document.getElementById('recap-ambient');
  const heroTitle = document.getElementById('hero-title');
  const heroSubtitle = document.getElementById('hero-subtitle');
  const statMoments = document.getElementById('stat-moments');
  const statDays = document.getElementById('stat-days');
  const statPeople = document.getElementById('stat-people');
  const tabAll = document.getElementById('tab-all');
  const tabPeople = document.getElementById('tab-people');
  const peoplePicker = document.getElementById('people-picker');
  const peopleSelect = document.getElementById('people-select');
  const gridLandscape = document.getElementById('recap-grid-landscape');
  const gridPortrait = document.getElementById('recap-grid-portrait');
  const gridsWrap = document.getElementById('recap-grids');
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

  if (heroBanner) {
    heroBanner.addEventListener('click', () => {
      if (!coverImageUrl) return;
      currentModal = { _isCover: true, _coverSrc: coverImageUrl };
      modalContent.innerHTML = '';
      const img = document.createElement('img');
      img.src = coverImageUrl;
      modalContent.appendChild(img);
      modalDownload.classList.add('hidden');
      modalOverlay.classList.add('active');
    });
  }

  modalDownload.addEventListener('click', () => {
    if (!currentModal || currentModal._isCover) return;
    const a = document.createElement('a');
    a.href = url('uploads/' + currentModal.filename);
    a.download = currentModal.originalName || currentModal.filename;
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
    try {
      const res = await fetch(api('recap') + (pathSlug ? `?slug=${encodeURIComponent(pathSlug)}` : ''));
      if (!res.ok) {
        empty.classList.remove('hidden');
        empty.textContent = res.status === 404 ? 'Album not found' : 'Failed to load album';
        return;
      }
      const data = await res.json();
      allPhotos = data.photos || [];

      if (data.event) {
        heroTitle.textContent = data.event.eventName || 'The Moments';
        heroSubtitle.textContent = data.event.eventSubtitle || '';
        const recapCover = data.event.recapCoverImage || data.event.coverImage;
        if (recapCover) {
          coverImageUrl = url('uploads/' + recapCover);
          if (heroBannerBg) heroBannerBg.style.backgroundImage = `url('${coverImageUrl}')`;
          if (recapAmbient) recapAmbient.style.backgroundImage = `url('${coverImageUrl}')`;
        }
        if (heroBanner) heroBanner.classList.remove('hidden');
        document.title = (data.event.eventName || 'Recap') + ' — Moments';
      }

      if (data.stats) {
        animateCount(statMoments, data.stats.moments);
        animateCount(statDays, data.stats.days);
        animateCount(statPeople, data.stats.people);
      }

      try {
        const pRes = await fetch(api('participants'));
        if (pRes.ok) {
          const participants = await pRes.json();
          peopleSelect.innerHTML = '<option value="">All people</option>';
          participants.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.participantNumber;
            opt.textContent = p.fullName;
            peopleSelect.appendChild(opt);
          });
        }
      } catch (e) {}

      renderGrid();
    } catch (err) {
      empty.classList.remove('hidden');
      empty.textContent = 'Could not load album — check your connection';
    }
  }

  function animateCount(el, target) {
    const n = parseInt(target, 10) || 0;
    let cur = 0;
    const step = Math.max(1, Math.ceil(n / 30));
    const id = setInterval(() => {
      cur = Math.min(cur + step, n);
      el.textContent = cur;
      if (cur >= n) clearInterval(id);
    }, 30);
  }

  function detectOrientation(p) {
    const src = url('uploads/' + p.filename);
    if (p.fileType === 'video') {
      return new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        const done = (landscape) => {
          v.removeAttribute('src');
          v.load();
          resolve(landscape ? 'landscape' : 'portrait');
        };
        v.addEventListener('loadedmetadata', () => {
          done(v.videoWidth >= v.videoHeight);
        }, { once: true });
        v.addEventListener('error', () => done(true), { once: true });
        v.src = src;
      });
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait');
      img.onerror = () => resolve('landscape');
      img.src = src;
    });
  }

  function createRecapItem(p) {
    const item = document.createElement('div');
    item.className = 'recap-item';
    const nameParts = (p.fullName || '').split(' ');
    const tag = nameParts.length > 1
      ? nameParts[0] + ' ' + nameParts[nameParts.length - 1].charAt(0) + '.'
      : nameParts[0] || '';

    const mediaEl = document.createElement(p.fileType === 'video' ? 'video' : 'img');
    mediaEl.src = url('uploads/' + p.filename);
    if (p.fileType === 'video') {
      mediaEl.muted = true;
      mediaEl.preload = 'metadata';
    } else {
      mediaEl.loading = 'lazy';
    }

    item.appendChild(mediaEl);
    if (p.fileType === 'video') {
      const videoTag = document.createElement('span');
      videoTag.className = 'video-tag';
      videoTag.innerHTML = '&#9654;';
      item.appendChild(videoTag);
    }
    const nameTag = document.createElement('span');
    nameTag.className = 'name-tag';
    nameTag.textContent = tag;
    item.appendChild(nameTag);
    item.addEventListener('click', () => openModal(p));
    return item;
  }

  function updateGridSections() {
    const hasLandscape = gridLandscape && gridLandscape.children.length > 0;
    const hasPortrait = gridPortrait && gridPortrait.children.length > 0;
    if (gridLandscape) gridLandscape.classList.toggle('hidden', !hasLandscape);
    if (gridPortrait) gridPortrait.classList.toggle('hidden', !hasPortrait);
    if (gridsWrap) gridsWrap.classList.toggle('hidden', !hasLandscape && !hasPortrait);
  }

  async function renderGrid() {
    let photos = allPhotos;
    if (viewMode === 'people' && peopleSelect.value) {
      photos = allPhotos.filter((p) => p.participantNumber === peopleSelect.value);
    }

    if (gridLandscape) gridLandscape.innerHTML = '';
    if (gridPortrait) gridPortrait.innerHTML = '';
    if (!photos.length) {
      empty.classList.remove('hidden');
      updateGridSections();
      return;
    }
    empty.classList.add('hidden');

    const classified = await Promise.all(photos.map(async (p) => ({
      photo: p,
      orient: await detectOrientation(p),
    })));

    classified.forEach(({ photo, orient }) => {
      const item = createRecapItem(photo);
      item.classList.add(orient);
      const target = orient === 'landscape' ? gridLandscape : gridPortrait;
      if (target) target.appendChild(item);
    });

    updateGridSections();
  }

  function openModal(p) {
    currentModal = p;
    modalContent.innerHTML = '';
    modalDownload.classList.remove('hidden');
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
    modalDownload.classList.remove('hidden');
    currentModal = null;
  }

  loadRecap();
})();
