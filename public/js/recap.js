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
  let visiblePhotos = [];
  let modalIndex = -1;
  let currentModal = null;
  let viewMode = 'all';
  let orientPending = 0;

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
  const gridsWrap = document.getElementById('recap-grids');
  const empty = document.getElementById('recap-empty');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContent = document.getElementById('modal-content');
  const modalClose = document.getElementById('modal-close');
  const modalPrev = document.getElementById('modal-prev');
  const modalNext = document.getElementById('modal-next');
  const modalCounter = document.getElementById('modal-counter');
  const modalDownload = document.getElementById('modal-download');

  const MO = window.MediaOrientation;

  function isLandscapeMedia(el) {
    if (MO) return MO.isLandscapeMedia(el);
    if (!el) return false;
    const w = el.naturalWidth || el.videoWidth || 0;
    const h = el.naturalHeight || el.videoHeight || 0;
    return w > 0 && h > 0 && w > h;
  }

  function applyItemLayout(mediaEl, itemEl, photo) {
    if (MO) {
      const orient = MO.applyMediaLayout(mediaEl, itemEl);
      itemEl.dataset.orient = orient;
      if (photo) photo._orient = orient;
      return orient;
    }
    const landscape = isLandscapeMedia(mediaEl);
    itemEl.classList.toggle('landscape', landscape);
    itemEl.classList.toggle('portrait', !landscape);
    itemEl.dataset.orient = landscape ? 'landscape' : 'portrait';
    mediaEl.style.objectFit = landscape ? 'contain' : 'cover';
    if (photo) photo._orient = landscape ? 'landscape' : 'portrait';
    return landscape ? 'landscape' : 'portrait';
  }

  function bindItemOrientation(mediaEl, itemEl, photo) {
    if (MO) {
      MO.bindMediaOrientation(mediaEl, itemEl, () => {
        applyItemLayout(mediaEl, itemEl, photo);
        onItemOriented();
      });
      return;
    }
    const done = () => {
      applyItemLayout(mediaEl, itemEl, photo);
      onItemOriented();
    };
    if (mediaEl.tagName === 'VIDEO') {
      mediaEl.addEventListener('loadedmetadata', done, { once: true });
      mediaEl.addEventListener('error', onItemOriented, { once: true });
    } else if (mediaEl.complete && mediaEl.naturalWidth) {
      done();
    } else {
      mediaEl.addEventListener('load', done, { once: true });
      mediaEl.addEventListener('error', onItemOriented, { once: true });
    }
  }

  function applyModalLayout(mediaEl) {
    if (MO) {
      const orient = MO.applyMediaLayout(mediaEl, modalContent);
      modalContent.classList.toggle('phone-rotated', orient === 'landscape' && isPhonePortrait());
      if (currentModal && !currentModal._isCover) currentModal._orient = orient;
      return;
    }
    const landscape = isLandscapeMedia(mediaEl);
    modalContent.classList.toggle('landscape', landscape);
    modalContent.classList.toggle('phone-rotated', landscape && isPhonePortrait());
    mediaEl.style.objectFit = landscape ? 'contain' : 'cover';
    if (currentModal && !currentModal._isCover) {
      currentModal._orient = landscape ? 'landscape' : 'portrait';
    }
  }

  function isPhonePortrait() {
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
  }

  tabAll.addEventListener('click', () => setView('all'));
  tabPeople.addEventListener('click', () => setView('people'));
  peopleSelect.addEventListener('change', () => renderGrid());
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  modalPrev.addEventListener('click', (e) => { e.stopPropagation(); showModalAt(modalIndex - 1); });
  modalNext.addEventListener('click', (e) => { e.stopPropagation(); showModalAt(modalIndex + 1); });

  document.addEventListener('keydown', (e) => {
    if (!modalOverlay.classList.contains('active')) return;
    if (e.key === 'ArrowLeft') showModalAt(modalIndex - 1);
    if (e.key === 'ArrowRight') showModalAt(modalIndex + 1);
    if (e.key === 'Escape') closeModal();
  });

  window.addEventListener('orientationchange', () => {
    if (!modalOverlay.classList.contains('active') || !currentModal || currentModal._isCover) return;
    const media = modalContent.querySelector('img, video');
    if (media) applyModalLayout(media);
  });

  if (heroBanner) {
    heroBanner.addEventListener('click', () => {
      if (!coverImageUrl) return;
      currentModal = { _isCover: true, _coverSrc: coverImageUrl };
      modalIndex = -1;
      modalContent.className = 'modal-content modal-spotlight';
      modalContent.innerHTML = '';
      const img = document.createElement('img');
      img.src = coverImageUrl;
      img.onload = () => applyModalLayout(img);
      modalContent.appendChild(img);
      modalDownload.classList.add('hidden');
      modalPrev.classList.add('hidden');
      modalNext.classList.add('hidden');
      modalCounter.classList.add('hidden');
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

  function createRecapItem(p, index) {
    const item = document.createElement('div');
    item.className = 'recap-item portrait';
    item.dataset.index = String(index);

    const nameParts = (p.fullName || '').split(' ');
    const tag = nameParts.length > 1
      ? nameParts[0] + ' ' + nameParts[nameParts.length - 1].charAt(0) + '.'
      : nameParts[0] || '';

    const mediaEl = document.createElement(p.fileType === 'video' ? 'video' : 'img');
    mediaEl.src = url('uploads/' + p.filename);
    if (p.fileType === 'video') {
      mediaEl.muted = true;
      mediaEl.playsInline = true;
      mediaEl.preload = 'metadata';
    } else {
      mediaEl.loading = 'lazy';
    }

    item.appendChild(mediaEl);
    bindItemOrientation(mediaEl, item, p);

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
    item.addEventListener('click', () => openModal(index));
    return item;
  }

  function onItemOriented() {
    orientPending = Math.max(0, orientPending - 1);
    if (orientPending === 0) regroupIntoRows();
  }

  function regroupIntoRows() {
    if (!gridsWrap) return;
    const items = [...gridsWrap.querySelectorAll('.recap-item')]
      .sort((a, b) => parseInt(a.dataset.index, 10) - parseInt(b.dataset.index, 10));
    if (!items.length) return;

    const fragment = document.createDocumentFragment();
    let row = null;
    let rowOrient = null;

    items.forEach((item) => {
      const orient = item.dataset.orient || 'portrait';
      if (!row || rowOrient !== orient) {
        row = document.createElement('div');
        row.className = 'recap-row recap-row-' + orient;
        fragment.appendChild(row);
        rowOrient = orient;
      }
      row.appendChild(item);
    });

    gridsWrap.innerHTML = '';
    gridsWrap.appendChild(fragment);
  }

  function renderGrid() {
    let photos = allPhotos;
    if (viewMode === 'people' && peopleSelect.value) {
      photos = allPhotos.filter((p) => p.participantNumber === peopleSelect.value);
    }

    visiblePhotos = photos;
    orientPending = photos.length;

    if (gridsWrap) gridsWrap.innerHTML = '';

    if (!photos.length) {
      empty.classList.remove('hidden');
      if (gridsWrap) gridsWrap.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    if (gridsWrap) gridsWrap.classList.remove('hidden');

    const flatRow = document.createElement('div');
    flatRow.className = 'recap-row recap-row-loading';

    photos.forEach((p, i) => {
      flatRow.appendChild(createRecapItem(p, i));
    });

    if (gridsWrap) gridsWrap.appendChild(flatRow);

    if (orientPending === 0) regroupIntoRows();
  }

  function renderModalMedia(p) {
    modalContent.className = 'modal-content modal-spotlight';
    modalContent.innerHTML = '';

    let mediaEl;
    if (p.fileType === 'video') {
      mediaEl = document.createElement('video');
      mediaEl.src = url('uploads/' + p.filename);
      mediaEl.controls = true;
      mediaEl.autoplay = true;
      mediaEl.playsInline = true;
      mediaEl.addEventListener('loadedmetadata', () => applyModalLayout(mediaEl), { once: true });
    } else {
      mediaEl = document.createElement('img');
      mediaEl.src = url('uploads/' + p.filename);
      mediaEl.addEventListener('load', () => applyModalLayout(mediaEl), { once: true });
    }

    modalContent.appendChild(mediaEl);
  }

  function updateModalNav() {
    const isCover = currentModal && currentModal._isCover;
    const hasPrev = !isCover && modalIndex > 0;
    const hasNext = !isCover && modalIndex < visiblePhotos.length - 1;

    modalPrev.classList.toggle('hidden', !hasPrev);
    modalNext.classList.toggle('hidden', !hasNext);
    modalDownload.classList.toggle('hidden', isCover);

    if (isCover || visiblePhotos.length <= 1) {
      modalCounter.classList.add('hidden');
    } else {
      modalCounter.classList.remove('hidden');
      modalCounter.textContent = (modalIndex + 1) + ' / ' + visiblePhotos.length;
    }
  }

  function openModal(index) {
    showModalAt(index);
  }

  function showModalAt(index) {
    if (index < 0 || index >= visiblePhotos.length) return;
    modalIndex = index;
    currentModal = visiblePhotos[index];
    renderModalMedia(currentModal);
    modalOverlay.classList.add('active');
    updateModalNav();
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    modalContent.innerHTML = '';
    modalContent.className = 'modal-content';
    modalDownload.classList.remove('hidden');
    modalPrev.classList.remove('hidden');
    modalNext.classList.remove('hidden');
    modalCounter.classList.add('hidden');
    currentModal = null;
    modalIndex = -1;
  }

  loadRecap();
})();
