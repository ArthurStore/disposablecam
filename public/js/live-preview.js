/* Live Preview — 3-column masonry + center spotlight (dynamic aspect) */

(function () {
  'use strict';

  const MO = window.MediaOrientation;

  const BASE = (function () {
    const p = window.location.pathname.replace(/\/live\/?$/, '/');
    return p.endsWith('/') ? p : p + '/';
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  const socket = io({ path: BASE + 'socket.io' });
  const SLIDE_DURATION = 8000;
  const VIDEO_MAX_DURATION = 45000;

  let uploads = [];
  let currentIndex = 0;
  let slideTimer = null;

  const waitingScreen = document.getElementById('waiting-screen');
  const liveApp = document.getElementById('live-app');
  const uploadCount = document.getElementById('upload-count');
  const liveClock = document.getElementById('live-clock');
  const colLeft = document.getElementById('col-left');
  const colRight = document.getElementById('col-right');
  const spotlightMedia = document.getElementById('spotlight-media');
  const spotlightCaption = document.getElementById('spotlight-caption');
  const spotlightName = document.getElementById('spotlight-name');
  const spotlightNumber = document.getElementById('spotlight-number');
  const spotlightBar = document.getElementById('spotlight-bar');
  const spotlightEl = document.querySelector('.spotlight');
  const microToast = document.getElementById('micro-toast');

  function applySpotlightLayout(mediaEl) {
    if (!spotlightEl) return;
    if (MO) {
      MO.applyMediaLayout(mediaEl, spotlightEl);
      return;
    }
    const landscape = mediaEl && (mediaEl.naturalWidth || mediaEl.videoWidth) > (mediaEl.naturalHeight || mediaEl.videoHeight);
    spotlightEl.classList.toggle('landscape', landscape);
    if (mediaEl) mediaEl.style.objectFit = landscape ? 'contain' : 'cover';
  }

  function bindTileOrientation(mediaEl, tileEl) {
    if (MO) {
      MO.bindMediaOrientation(mediaEl, tileEl);
      return;
    }
    const apply = () => {
      const w = mediaEl.naturalWidth || mediaEl.videoWidth || 0;
      const h = mediaEl.naturalHeight || mediaEl.videoHeight || 0;
      if (w && h && w > h) tileEl.classList.add('landscape');
    };
    if (mediaEl.tagName === 'VIDEO') mediaEl.addEventListener('loadedmetadata', apply, { once: true });
    else if (mediaEl.complete) apply();
    else mediaEl.addEventListener('load', apply, { once: true });
  }

  function startClock() {
    function tick() {
      liveClock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    tick();
    setInterval(tick, 30000);
  }

  async function loadUploads() {
    try {
      const res = await fetch(api('all-uploads'));
      uploads = await res.json();
      uploads.reverse();
      if (uploads.length > 0) {
        waitingScreen.classList.add('hidden');
        liveApp.classList.remove('hidden');
        renderColumns();
        showSlide(0);
        startClock();
      }
    } catch (err) {
      console.error('Failed to load uploads');
    }
  }

  function renderColumns() {
    colLeft.innerHTML = '';
    colRight.innerHTML = '';
    uploadCount.textContent = `${uploads.length} moment${uploads.length !== 1 ? 's' : ''}`;

    uploads.forEach((item, idx) => {
      const tile = createTile(item, idx);
      if (idx % 2 === 0) colLeft.appendChild(tile);
      else colRight.appendChild(tile);
    });
  }

  function createTile(item, idx) {
    const el = document.createElement('div');
    el.className = 'masonry-tile' + (idx === currentIndex ? ' active' : '');
    el.dataset.index = idx;

    let mediaEl;
    if (item.fileType === 'video') {
      const vid = document.createElement('video');
      vid.src = url('uploads/' + item.filename);
      vid.muted = true;
      vid.playsInline = true;
      vid.loop = true;
      vid.autoplay = true;
      vid.preload = 'metadata';
      el.appendChild(vid);
      mediaEl = vid;
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + item.filename);
      img.loading = 'lazy';
      el.appendChild(img);
      mediaEl = img;
    }

    bindTileOrientation(mediaEl, el);

    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = (item.fullName || '').split(' ')[0].toUpperCase();
    el.appendChild(name);

    el.addEventListener('click', () => {
      clearTimeout(slideTimer);
      showSlide(idx);
    });

    return el;
  }

  function updateActiveTiles() {
    document.querySelectorAll('.masonry-tile').forEach((el) => {
      el.classList.toggle('active', parseInt(el.dataset.index, 10) === currentIndex);
    });
  }

  function showSlide(index) {
    if (!uploads.length) return;
    currentIndex = index % uploads.length;
    const current = uploads[currentIndex];
    updateActiveTiles();

    spotlightMedia.innerHTML = '';
    clearTimeout(slideTimer);

    if (current.fileType === 'video') {
      const vid = document.createElement('video');
      vid.src = url('uploads/' + current.filename);
      vid.autoplay = true;
      vid.muted = false;
      vid.playsInline = true;
      vid.loop = false;
      vid.onended = () => advanceSlide();
      vid.onloadedmetadata = () => applySpotlightLayout(vid);
      spotlightMedia.appendChild(vid);
      slideTimer = setTimeout(advanceSlide, VIDEO_MAX_DURATION);
      spotlightBar.style.transition = 'none';
      spotlightBar.style.width = '0%';
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + current.filename);
      img.onload = () => applySpotlightLayout(img);
      spotlightMedia.appendChild(img);
      spotlightBar.style.transition = 'none';
      spotlightBar.style.width = '0%';
      requestAnimationFrame(() => {
        spotlightBar.style.transition = `width ${SLIDE_DURATION}ms linear`;
        spotlightBar.style.width = '100%';
      });
      slideTimer = setTimeout(advanceSlide, SLIDE_DURATION);
    }

    spotlightName.textContent = current.fullName;
    spotlightNumber.textContent = `#${current.participantNumber}`;

    if (current.caption) {
      spotlightCaption.textContent = current.caption;
      spotlightCaption.className = 'spotlight-caption ' + (current.captionPosition || 'bottom');
      spotlightCaption.classList.remove('hidden');
    } else {
      spotlightCaption.classList.add('hidden');
    }
  }

  function advanceSlide() {
    clearTimeout(slideTimer);
    showSlide(currentIndex + 1);
  }

  socket.on('new-upload', (data) => {
    uploads.push(data);
    uploadCount.textContent = `${uploads.length} moment${uploads.length !== 1 ? 's' : ''}`;
    if (uploads.length === 1) {
      waitingScreen.classList.add('hidden');
      liveApp.classList.remove('hidden');
      startClock();
      renderColumns();
      showSlide(0);
    } else {
      renderColumns();
    }
    showMicroToast('New moment');
  });

  socket.on('media-deleted', (data) => {
    const idx = uploads.findIndex((u) => u._id === data.id);
    if (idx === -1) return;
    uploads.splice(idx, 1);
    if (!uploads.length) {
      waitingScreen.classList.remove('hidden');
      liveApp.classList.add('hidden');
      clearTimeout(slideTimer);
    } else {
      renderColumns();
      if (currentIndex >= uploads.length) showSlide(0);
      else showSlide(currentIndex);
    }
  });

  socket.on('event-reset', () => {
    uploads = [];
    clearTimeout(slideTimer);
    spotlightMedia.innerHTML = '';
    colLeft.innerHTML = '';
    colRight.innerHTML = '';
    waitingScreen.classList.remove('hidden');
    liveApp.classList.add('hidden');
    showMicroToast('Event data reset');
  });

  function showMicroToast(msg) {
    microToast.textContent = msg;
    microToast.classList.add('show');
    setTimeout(() => microToast.classList.remove('show'), 2200);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') advanceSlide();
    else if (e.key === 'ArrowLeft') {
      clearTimeout(slideTimer);
      showSlide(currentIndex - 1 + uploads.length);
    }
  });

  loadUploads();
})();
