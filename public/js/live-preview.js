/* ═══════════════════════════════════════
   Disposable Camera — Live Preview (Projector)
   ═══════════════════════════════════════ */

/* globals io */

(function () {
  'use strict';

  const socket = io();
  const SLIDE_DURATION = 8000; // ms per slide (photos)
  const VIDEO_MAX_DURATION = 30000; // max video play time

  let uploads = [];
  let currentIndex = 0;
  let slideTimer = null;

  const waitingScreen = document.getElementById('waiting-screen');
  const slideshow = document.getElementById('slideshow');
  const progressBar = document.getElementById('slide-progress');
  const counterEl = document.getElementById('slide-counter');
  const prevMedia = document.getElementById('prev-media');
  const centerMedia = document.getElementById('center-media');
  const nextMedia = document.getElementById('next-media');
  const centerName = document.getElementById('center-name');
  const centerNumber = document.getElementById('center-number');
  const centerGender = document.getElementById('center-gender');
  const centerCaption = document.getElementById('center-caption');
  const toast = document.getElementById('new-upload-toast');

  // ─── Load all uploads ───
  async function loadUploads() {
    try {
      const res = await fetch('/api/all-uploads');
      uploads = await res.json();
      // Reverse so oldest first for slideshow
      uploads.reverse();

      if (uploads.length > 0) {
        waitingScreen.style.display = 'none';
        slideshow.style.display = 'block';
        showSlide(0);
      }
    } catch (err) {
      console.error('Failed to load uploads');
    }
  }

  // ─── Show a slide ───
  function showSlide(index) {
    if (uploads.length === 0) return;

    currentIndex = index % uploads.length;
    const current = uploads[currentIndex];
    const prev = uploads[(currentIndex - 1 + uploads.length) % uploads.length];
    const next = uploads[(currentIndex + 1) % uploads.length];

    // Update counter
    counterEl.textContent = `${currentIndex + 1} / ${uploads.length}`;

    // Center panel
    centerMedia.innerHTML = '';
    if (current.fileType === 'video') {
      const vid = document.createElement('video');
      vid.src = `/uploads/${current.filename}`;
      vid.autoplay = true;
      vid.muted = false;
      vid.playsInline = true;
      vid.onended = () => advanceSlide();
      centerMedia.appendChild(vid);

      // Safety timeout for long videos
      clearTimeout(slideTimer);
      slideTimer = setTimeout(advanceSlide, VIDEO_MAX_DURATION);

      // No progress bar for video
      progressBar.style.width = '0%';
    } else {
      const img = document.createElement('img');
      img.src = `/uploads/${current.filename}`;
      centerMedia.appendChild(img);

      // Progress bar animation
      progressBar.style.transition = 'none';
      progressBar.style.width = '0%';
      requestAnimationFrame(() => {
        progressBar.style.transition = `width ${SLIDE_DURATION}ms linear`;
        progressBar.style.width = '100%';
      });

      clearTimeout(slideTimer);
      slideTimer = setTimeout(advanceSlide, SLIDE_DURATION);
    }

    // Center info
    centerName.textContent = current.fullName;
    centerNumber.textContent = `#${current.participantNumber}`;

    const isMale = current.gender === 'L';
    centerGender.className = `gender-badge ${isMale ? 'male' : 'female'}`;
    centerGender.innerHTML = isMale ? '♂' : '♀';

    // Caption
    if (current.caption) {
      centerCaption.textContent = `"${current.caption}"`;
      centerCaption.style.display = 'block';
    } else {
      centerCaption.style.display = 'none';
    }

    // Side panels
    renderSidePanel(prevMedia, prev);
    renderSidePanel(nextMedia, next);
  }

  function renderSidePanel(container, item) {
    container.innerHTML = '';
    if (!item) return;

    if (item.fileType === 'video') {
      const vid = document.createElement('video');
      vid.src = `/uploads/${item.filename}`;
      vid.muted = true;
      vid.preload = 'metadata';
      container.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = `/uploads/${item.filename}`;
      img.loading = 'lazy';
      container.appendChild(img);
    }
  }

  function advanceSlide() {
    clearTimeout(slideTimer);
    showSlide(currentIndex + 1);
  }

  // ─── Real-time updates ───
  socket.on('new-upload', (data) => {
    uploads.push(data);

    if (uploads.length === 1) {
      waitingScreen.style.display = 'none';
      slideshow.style.display = 'block';
      showSlide(0);
    }

    // Toast notification
    showToast();
  });

  socket.on('media-deleted', (data) => {
    const idx = uploads.findIndex(u => u._id === data.id);
    if (idx !== -1) {
      uploads.splice(idx, 1);
      if (uploads.length === 0) {
        waitingScreen.style.display = 'flex';
        slideshow.style.display = 'none';
        clearTimeout(slideTimer);
      } else if (currentIndex >= uploads.length) {
        showSlide(0);
      } else {
        showSlide(currentIndex);
      }
    }
  });

  function showToast() {
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ─── Keyboard navigation ───
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      advanceSlide();
    } else if (e.key === 'ArrowLeft') {
      clearTimeout(slideTimer);
      showSlide(currentIndex - 1 + uploads.length);
    }
  });

  // ─── Init ───
  loadUploads();
})();
