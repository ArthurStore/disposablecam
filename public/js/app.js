/* ═══════════════════════════════════════
   Disposable Camera — Main App Logic
   (subdir-safe, relative paths only)
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  // Resolve the directory the page is served from (e.g. "/" or "/cam/").
  // We use this to build same-origin URLs without leading slashes,
  // so the app works at root or under /cam.
  const BASE = (function () {
    const p = window.location.pathname;
    return p.endsWith('/') ? p : p.replace(/\/[^/]*$/, '/');
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  // ─── State ───
  let currentUser = null;
  let currentFacingMode = 'environment';
  let mediaStream = null;
  let isVideoMode = false;
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let longPressTimer = null;
  let galleryOpen = true;
  let mirrorOverride = null; // null = auto (front camera), true/false = forced
  let recStart = 0;
  let recTimerId = null;
  let hudTimerId = null;

  // ─── DOM refs ───
  const registrationModal = document.getElementById('registration-modal');
  const participantInput = document.getElementById('participant-input');
  const registerBtn = document.getElementById('register-btn');
  const registerError = document.getElementById('register-error');
  const appEl = document.getElementById('app');
  const userName = document.getElementById('user-name');
  const userNumber = document.getElementById('user-number');
  const genderIcon = document.getElementById('gender-icon');
  const logoutBtn = document.getElementById('logout-btn');
  const video = document.getElementById('camera-preview');
  const canvas = document.getElementById('capture-canvas');
  const captureBtn = document.getElementById('capture-btn');
  const rotateBtn = document.getElementById('rotate-btn');
  const mirrorBtn = document.getElementById('mirror-btn');
  const gridBtn = document.getElementById('grid-btn');
  const modeToggleBtn = document.getElementById('mode-toggle-btn');
  const modeIndicator = document.getElementById('mode-indicator');
  const recordingIndicator = document.getElementById('recording-indicator');
  const recTimer = document.getElementById('rec-timer');
  const captionInput = document.getElementById('caption-input');
  const flashOverlay = document.getElementById('flash-overlay');
  const shutterOverlay = document.getElementById('shutter-overlay');
  const uploadProgress = document.getElementById('upload-progress');
  const progressFill = document.querySelector('.progress-fill');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmpty = document.getElementById('gallery-empty');
  const galleryToggle = document.getElementById('gallery-toggle');
  const toggleArrow = document.querySelector('.toggle-arrow');
  const mediaModal = document.getElementById('media-modal');
  const mediaModalBody = document.getElementById('media-modal-body');
  const mediaModalClose = document.getElementById('media-modal-close');
  const viewfinder = document.getElementById('viewfinder');
  const hudRes = document.getElementById('hud-res');
  const hudTime = document.getElementById('hud-time');

  // ─── Audio ───
  const AudioCtx = window.AudioContext || window.webkitAudioContext;

  function playShutterSound() {
    try {
      const ctx = new AudioCtx();
      const dur = 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + dur);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  function playBeepSound() {
    try {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ═══ Registration ═══
  function checkSession() {
    const saved = localStorage.getItem('dc_user');
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
        showApp();
      } catch (e) { localStorage.removeItem('dc_user'); }
    }
  }

  registerBtn.addEventListener('click', doRegister);
  participantInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });

  async function doRegister() {
    const num = participantInput.value.trim();
    if (!num) { registerError.textContent = 'Please enter your participant number'; return; }

    registerBtn.disabled = true;
    registerBtn.textContent = 'Checking…';
    registerError.textContent = '';

    try {
      const res = await fetch(api('validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantNumber: num })
      });
      const data = await res.json();

      if (!res.ok) { registerError.textContent = data.error || 'Validation failed'; return; }

      currentUser = data;
      localStorage.setItem('dc_user', JSON.stringify(data));
      showApp();
    } catch (err) {
      registerError.textContent = 'Connection error. Try again.';
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = 'Join Event';
    }
  }

  function showApp() {
    registrationModal.classList.add('hidden');
    appEl.classList.remove('hidden');

    userName.textContent = currentUser.fullName;
    userNumber.textContent = `#${currentUser.participantNumber}`;

    const isMale = currentUser.gender === 'L';
    genderIcon.className = `gender-icon ${isMale ? 'male' : 'female'}`;
    genderIcon.innerHTML = `<img src="${url('images/' + (isMale ? 'male' : 'female') + '-icon.svg')}" alt="${isMale ? 'Male' : 'Female'}">`;

    initCamera();
    loadGallery();
    startHud();
    if (typeof initChat === 'function') initChat(currentUser);
  }

  logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('dc_user');
      location.reload();
    }
  });

  // ═══ Camera ═══
  async function initCamera() {
    try {
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());

      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: isVideoMode
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = mediaStream;

      applyMirror();

      // Update HUD resolution once metadata loads
      video.onloadedmetadata = () => {
        hudRes.textContent = `${video.videoWidth}×${video.videoHeight}`;
      };
    } catch (err) {
      console.error('Camera error:', err);
      alert('Unable to access camera. Please grant permission and try again.');
    }
  }

  function applyMirror() {
    const auto = currentFacingMode === 'user';
    const on = mirrorOverride === null ? auto : mirrorOverride;
    video.classList.toggle('mirrored', on);
    mirrorBtn.setAttribute('aria-pressed', String(on));
    mirrorBtn.classList.toggle('active', on);
  }

  rotateBtn.addEventListener('click', () => {
    vibrate(30);
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    mirrorOverride = null; // re-enable auto mirror behavior on rotate
    initCamera();
  });

  mirrorBtn.addEventListener('click', () => {
    vibrate(20);
    const currentlyOn = video.classList.contains('mirrored');
    mirrorOverride = !currentlyOn;
    applyMirror();
  });

  gridBtn.addEventListener('click', () => {
    vibrate(20);
    const on = viewfinder.classList.toggle('show-grid');
    gridBtn.setAttribute('aria-pressed', String(on));
    gridBtn.classList.toggle('active', on);
  });

  // Mode toggle (photo/video)
  modeToggleBtn.addEventListener('click', () => {
    vibrate(30);
    isVideoMode = !isVideoMode;
    modeIndicator.textContent = isVideoMode ? 'VIDEO' : 'PHOTO';
    modeIndicator.classList.toggle('video', isVideoMode);

    if (isVideoMode) {
      captureBtn.classList.add('video-mode');
    } else {
      captureBtn.classList.remove('video-mode');
      if (isRecording) stopRecording();
    }
    initCamera();
  });

  // ─── Capture ───
  captureBtn.addEventListener('click', () => {
    if (isVideoMode) {
      isRecording ? stopRecording() : startRecording();
    } else {
      takePhoto();
    }
  });

  captureBtn.addEventListener('touchstart', () => {
    if (isVideoMode) return;
    longPressTimer = setTimeout(() => {
      isVideoMode = true;
      modeIndicator.textContent = 'VIDEO';
      modeIndicator.classList.add('video');
      initCamera().then(() => startRecording());
    }, 800);
  }, { passive: true });

  captureBtn.addEventListener('touchend', () => clearTimeout(longPressTimer));
  captureBtn.addEventListener('touchcancel', () => clearTimeout(longPressTimer));

  function takePhoto() {
    vibrate(50);
    playShutterSound();

    flashOverlay.classList.add('active');
    setTimeout(() => flashOverlay.classList.remove('active'), 120);

    shutterOverlay.classList.add('active');
    setTimeout(() => shutterOverlay.classList.remove('active'), 420);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    // Mirror saved photo only when the live preview is mirrored
    if (video.classList.contains('mirrored')) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) uploadMedia(blob, 'photo.jpg', 'image/jpeg');
    }, 'image/jpeg', 0.92);
  }

  function startRecording() {
    if (!mediaStream) return;
    vibrate([50, 50, 50]);
    playBeepSound();

    recordedChunks = [];
    const options = { mimeType: 'video/webm;codecs=vp8,opus' };
    try { mediaRecorder = new MediaRecorder(mediaStream, options); }
    catch (e) {
      try { mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' }); }
      catch (e2) { mediaRecorder = new MediaRecorder(mediaStream); }
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      uploadMedia(blob, 'video.webm', blob.type);
      recordedChunks = [];
    };

    mediaRecorder.start(100);
    isRecording = true;
    captureBtn.classList.add('recording');
    recordingIndicator.classList.remove('hidden');
    recStart = Date.now();
    recTimer.textContent = '00:00';
    recTimerId = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      recTimer.textContent = `${mm}:${ss}`;
    }, 500);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    isRecording = false;
    captureBtn.classList.remove('recording');
    recordingIndicator.classList.add('hidden');
    if (recTimerId) { clearInterval(recTimerId); recTimerId = null; }
    vibrate(100);
  }

  // ═══ Upload ═══
  async function uploadMedia(blob, filename, mimetype) {
    uploadProgress.classList.remove('hidden');
    progressFill.style.width = '30%';

    const formData = new FormData();
    formData.append('media', blob, filename);
    formData.append('participantNumber', currentUser.participantNumber);
    formData.append('fullName', currentUser.fullName);
    formData.append('gender', currentUser.gender);
    formData.append('caption', captionInput.value.trim());

    try {
      progressFill.style.width = '60%';
      const res = await fetch(api('upload'), { method: 'POST', body: formData });
      progressFill.style.width = '90%';
      const data = await res.json();

      if (res.ok) {
        vibrate([50, 30, 50]);
        progressFill.style.width = '100%';
        captionInput.value = '';
        loadGallery();
        setTimeout(() => {
          uploadProgress.classList.add('hidden');
          progressFill.style.width = '0';
        }, 800);
      } else {
        alert(data.error || 'Upload failed');
        uploadProgress.classList.add('hidden');
        progressFill.style.width = '0';
      }
    } catch (err) {
      alert('Upload failed. Check your connection.');
      uploadProgress.classList.add('hidden');
      progressFill.style.width = '0';
    }
  }

  // ═══ Gallery ═══
  const TRASH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';

  async function loadGallery() {
    if (!currentUser) return;
    try {
      const res = await fetch(api('gallery/' + encodeURIComponent(currentUser.participantNumber)));
      const photos = await res.json();

      galleryGrid.innerHTML = '';

      if (!photos.length) { galleryEmpty.classList.remove('hidden'); return; }
      galleryEmpty.classList.add('hidden');

      photos.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';

        if (p.fileType === 'video') {
          item.innerHTML = `
            <video src="${url('uploads/' + p.filename)}" muted preload="metadata"></video>
            <span class="video-badge">▶</span>
          `;
        } else {
          item.innerHTML = `<img src="${url('uploads/' + p.filename)}" alt="Photo" loading="lazy">`;
        }

        if (p.caption) {
          item.innerHTML += `<span class="item-caption">${escapeHtml(p.caption)}</span>`;
        }

        item.innerHTML += `<button class="delete-btn" data-id="${p._id}" title="Delete" aria-label="Delete">${TRASH_SVG}</button>`;

        item.addEventListener('click', (e) => {
          if (e.target.closest('.delete-btn')) return;
          openMediaModal(p);
        });

        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteMedia(p._id);
        });

        galleryGrid.appendChild(item);
      });
    } catch (err) {
      console.error('Gallery load error:', err);
    }
  }

  async function deleteMedia(id) {
    if (!confirm('Delete this moment?')) return;
    try {
      const res = await fetch(api('media/' + encodeURIComponent(id)), { method: 'DELETE' });
      if (res.ok) { vibrate(50); loadGallery(); }
    } catch (err) { alert('Delete failed'); }
  }

  galleryToggle.addEventListener('click', () => {
    galleryOpen = !galleryOpen;
    galleryGrid.style.display = galleryOpen ? 'grid' : 'none';
    galleryEmpty.style.display = galleryOpen && galleryGrid.children.length === 0 ? 'block' : 'none';
    toggleArrow.classList.toggle('collapsed', !galleryOpen);
  });

  function openMediaModal(p) {
    mediaModalBody.innerHTML = '';
    if (p.fileType === 'video') {
      const v = document.createElement('video');
      v.src = url('uploads/' + p.filename);
      v.controls = true; v.autoplay = true;
      mediaModalBody.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + p.filename);
      mediaModalBody.appendChild(img);
    }
    mediaModal.classList.remove('hidden');
  }

  mediaModalClose.addEventListener('click', () => {
    mediaModal.classList.add('hidden');
    mediaModalBody.innerHTML = '';
  });

  mediaModal.addEventListener('click', (e) => {
    if (e.target === mediaModal) {
      mediaModal.classList.add('hidden');
      mediaModalBody.innerHTML = '';
    }
  });

  // ─── HUD clock ───
  function startHud() {
    function tick() {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      hudTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    tick();
    hudTimerId = setInterval(tick, 30000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  checkSession();
})();
