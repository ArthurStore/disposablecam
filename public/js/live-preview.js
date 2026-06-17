/* ═══════════════════════════════════════
   Disposable Camera — Live Preview
   Instagram Story grid + spotlight rotation
   (subdir-safe relative paths)
   ═══════════════════════════════════════ */

/* globals io */

(function () {
  'use strict';

  const BASE = (function () {
    const p = window.location.pathname.replace(/\/live\/?$/, '/');
    return p.endsWith('/') ? p : p + '/';
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  const socket = io({ path: BASE + 'socket.io' });
  const SLIDE_DURATION = 8000;
  const VIDEO_MAX_DURATION = 30000;

  let uploads = [];
  let currentIndex = 0;
  let slideTimer = null;

  const waitingScreen = document.getElementById('waiting-screen');
  const liveApp = document.getElementById('live-app');
  const uploadCount = document.getElementById('upload-count');
  const liveClock = document.getElementById('live-clock');
  const spotlightMedia = document.getElementById('spotlight-media');
  const spotlightCaption = document.getElementById('spotlight-caption');
  const spotlightAvatar = document.getElementById('spotlight-avatar');
  const spotlightName = document.getElementById('spotlight-name');
  const spotlightNumber = document.getElementById('spotlight-number');
  const spotlightBar = document.getElementById('spotlight-bar');
  const storyGrid = document.getElementById('story-grid');
  const microToast = document.getElementById('micro-toast');

  function startClock() {
    function tick() {
      const d = new Date();
      liveClock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        renderGrid();
        showSlide(0);
        startClock();
      }
    } catch (err) {
      console.error('Failed to load uploads');
    }
  }

  function renderGrid() {
    storyGrid.innerHTML = '';
    uploadCount.textContent = `${uploads.length} moment${uploads.length !== 1 ? 's' : ''}`;

    uploads.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'grid-item' + (idx === currentIndex ? ' active' : '');
      el.dataset.index = idx;

      if (item.fileType === 'video') {
        el.innerHTML = `
          <video src="${url('uploads/' + item.filename)}" muted preload="metadata"></video>
          <span class="grid-video-badge">▶</span>
          <span class="grid-user">${escapeHtml(item.fullName)}</span>
        `;
      } else {
        el.innerHTML = `
          <img src="${url('uploads/' + item.filename)}" alt="" loading="lazy">
          <span class="grid-user">${escapeHtml(item.fullName)}</span>
        `;
      }

      el.addEventListener('click', () => {
        clearTimeout(slideTimer);
        showSlide(idx);
      });

      storyGrid.appendChild(el);
    });

    scrollActiveIntoView();
  }

  function scrollActiveIntoView() {
    const active = storyGrid.querySelector('.grid-item.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function showSlide(index) {
    if (uploads.length === 0) return;

    currentIndex = index % uploads.length;
    const current = uploads[currentIndex];

    storyGrid.querySelectorAll('.grid-item').forEach((el, i) => {
      el.classList.toggle('active', i === currentIndex);
    });
    scrollActiveIntoView();

    spotlightMedia.innerHTML = '';
    clearTimeout(slideTimer);

    if (current.fileType === 'video') {
      const vid = document.createElement('video');
      vid.src = url('uploads/' + current.filename);
      vid.autoplay = true;
      vid.muted = false;
      vid.playsInline = true;
      vid.onended = () => advanceSlide();
      spotlightMedia.appendChild(vid);
      slideTimer = setTimeout(advanceSlide, VIDEO_MAX_DURATION);
      spotlightBar.style.transition = 'none';
      spotlightBar.style.width = '0%';
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + current.filename);
      spotlightMedia.appendChild(img);

      spotlightBar.style.transition = 'none';
      spotlightBar.style.width = '0%';
      requestAnimationFrame(() => {
        spotlightBar.style.transition = `width ${SLIDE_DURATION}ms linear`;
        spotlightBar.style.width = '100%';
      });
      slideTimer = setTimeout(advanceSlide, SLIDE_DURATION);
    }

    const isMale = current.gender === 'L';
    spotlightAvatar.className = `spotlight-avatar ${isMale ? 'male' : 'female'}`;
    spotlightAvatar.textContent = isMale ? '♂' : '♀';
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
      renderGrid();
      showSlide(0);
    } else {
      renderGrid();
    }

    showMicroToast('New moment captured');
  });

  socket.on('media-deleted', (data) => {
    const idx = uploads.findIndex(u => u._id === data.id);
    if (idx !== -1) {
      uploads.splice(idx, 1);
      if (uploads.length === 0) {
        waitingScreen.classList.remove('hidden');
        liveApp.classList.add('hidden');
        clearTimeout(slideTimer);
      } else {
        renderGrid();
        if (currentIndex >= uploads.length) showSlide(0);
        else showSlide(currentIndex);
      }
    }
  });

  function showMicroToast(msg) {
    microToast.textContent = msg;
    microToast.classList.add('show');
    setTimeout(() => microToast.classList.remove('show'), 2500);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') advanceSlide();
    else if (e.key === 'ArrowLeft') {
      clearTimeout(slideTimer);
      showSlide(currentIndex - 1 + uploads.length);
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  loadUploads();
})();
