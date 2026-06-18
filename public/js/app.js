/* ═══════════════════════════════════════
   Disposable Camera — Main App Logic
   ═══════════════════════════════════════ */

(function () {
  'use strict';

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
  let currentMode = 'photo';
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let longPressTimer = null;
  let mirrorOverride = null;
  let recStart = 0;
  let recTimerId = null;
  let flashMode = 'off';
  let zoomLevel = 1;
  let currentZoomPreset = 1;
  let lastTapTime = 0;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pendingCapture = null;

  // Settings state
  let gridEnabled = false;
  let timerSeconds = 0;
  let continuousMode = false;
  let tlInterval = 2;
  let timerActive = false;
  let timerCountdownId = null;

  // Draft queue — each item: {blob, filename, mimetype, objUrl, caption, snapBarY}
  let draftQueue = [];
  let draftViewIndex = 0;

  // Moments counter
  let momentsCaptured = 0;

  // Timelapse
  let tlIntervalId = null;
  let tlFrames = [];
  let tlCapturing = false;
  let tlFrameCount = 0;

  // Snap caption bar drag state (single review)
  let snapBarDragging = false;
  let snapBarStartY = 0;
  let snapBarStartTop = 0;
  let snapBarY = 50; // percent

  // Draft snap bar drag state
  let draftSnapDragging = false;
  let draftSnapStartY = 0;
  let draftSnapStartTop = 0;

  // Focus / exposure
  let focusActive = false;
  let focusBoxX = 0;
  let focusBoxY = 0;
  let exposureLevel = 0.5;
  let exposureDragging = false;
  let exposureStartY = 0;
  let exposureStartLevel = 0.5;
  let aeAfLocked = false;
  let focusLongPressTimer = null;
  let isCapturing = false;

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
  const settingsBtn = document.getElementById('settings-btn');
  const video = document.getElementById('camera-preview');
  const zoomLayer = document.getElementById('zoom-layer');
  const canvas = document.getElementById('capture-canvas');
  const captureBtn = document.getElementById('capture-btn');
  const rotateBtn = document.getElementById('rotate-btn');
  const flashBtn = document.getElementById('flash-btn');
  const recordingIndicator = document.getElementById('recording-indicator');
  const recTimer = document.getElementById('rec-timer');
  const tlIndicator = document.getElementById('timelapse-indicator');
  const tlFrameCountEl = document.getElementById('tl-frame-count');
  const galleryBtn = document.getElementById('gallery-btn');
  const galleryThumb = document.getElementById('gallery-thumb');
  const welcomeCover = document.getElementById('welcome-cover');
  const welcomeEventName = document.getElementById('welcome-event-name');
  const welcomeEventSubtitle = document.getElementById('welcome-event-subtitle');
  const galleryModal = document.getElementById('gallery-modal');
  const galleryModalClose = document.getElementById('gallery-modal-close');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmpty = document.getElementById('gallery-empty');
  const uploadProgress = document.getElementById('upload-progress');
  const progressFill = document.querySelector('.progress-fill');
  const mediaModal = document.getElementById('media-modal');
  const mediaModalBody = document.getElementById('media-modal-body');
  const mediaModalClose = document.getElementById('media-modal-close');
  const viewfinder = document.getElementById('viewfinder');
  const reviewScreen = document.getElementById('review-screen');
  const reviewMedia = document.getElementById('review-media');
  const reviewCaptionInput = document.getElementById('review-caption-input');
  const reviewDiscardBtn = document.getElementById('review-discard-btn');
  const reviewUploadBtn = document.getElementById('review-upload-btn');
  const microToast = document.getElementById('micro-toast');
  const timerCountdownEl = document.getElementById('timer-countdown');
  const gridOverlay = document.getElementById('grid-overlay');
  const momentsCounter = document.getElementById('moments-counter');
  const momentsCount = document.getElementById('moments-count');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsClose = document.getElementById('settings-close');
  const gridOff = document.getElementById('grid-off');
  const gridOn = document.getElementById('grid-on');
  const shootSingle = document.getElementById('shoot-single');
  const shootContinuous = document.getElementById('shoot-continuous');
  const draftBadge = document.getElementById('draft-badge');
  const draftCount = document.getElementById('draft-count');
  const draftReviewPanel = document.getElementById('draft-review-panel');
  const draftPanelClose = document.getElementById('draft-panel-close');
  const draftPanelCount = document.getElementById('draft-panel-count');
  const draftDiscardAll = document.getElementById('draft-discard-all');
  const draftUploadAll = document.getElementById('draft-upload-all');
  const draftViewerMedia = document.getElementById('draft-viewer-media');
  const draftSnapBar = document.getElementById('draft-snap-bar');
  const draftSnapText = document.getElementById('draft-snap-text');
  const draftViewerHint = document.getElementById('draft-viewer-hint');
  const draftPrev = document.getElementById('draft-prev');
  const draftNext = document.getElementById('draft-next');
  const draftItemCounter = document.getElementById('draft-item-counter');
  const draftDeleteCurrent = document.getElementById('draft-delete-current');
  const draftCaptionInput = document.getElementById('draft-caption-input');
  const draftUploadCurrent = document.getElementById('draft-upload-current');
  const snapCaptionBar = document.getElementById('snap-caption-bar');
  const snapCaptionText = document.getElementById('snap-caption-text');
  const snapTapHint = document.getElementById('snap-tap-hint');
  const orientationModal = document.getElementById('orientation-modal');
  const orientationUnderstandBtn = document.getElementById('orientation-understand-btn');
  const orientationDontShow = document.getElementById('orientation-dont-show');
  const focusOverlay = document.getElementById('focus-overlay');
  const focusBox = document.getElementById('focus-box');
  const exposureSlider = document.getElementById('exposure-slider');
  const exposureThumb = document.getElementById('exposure-thumb');

  // ─── Audio ───
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    return audioCtx;
  }

  function playShutterSound() {
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;
      function click(at, freq, dur, vol) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 2;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, at);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.3, at + dur);
        gain.gain.setValueAtTime(vol, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
        osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        osc.start(at); osc.stop(at + dur);
      }
      click(t, 2800, 0.04, 0.35);
      click(t + 0.045, 1800, 0.06, 0.28);
      click(t + 0.12, 900, 0.08, 0.12);
      const bufSize = ctx.sampleRate * 0.05;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      noise.connect(nGain); nGain.connect(ctx.destination); noise.start(t);
    } catch (e) {}
  }

  function playBeepSound() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  }

  function playTimerBeep(isFinal) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = isFinal ? 1800 : 1000;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (isFinal ? 0.2 : 0.08));
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function showMicroToast(msg, duration) {
    microToast.textContent = msg;
    microToast.classList.remove('hidden');
    microToast.classList.add('show');
    setTimeout(() => {
      microToast.classList.remove('show');
      setTimeout(() => microToast.classList.add('hidden'), 350);
    }, duration || 2500);
  }
  window.showMicroToast = showMicroToast;

  // ─── Smart Name Truncation ───
  function truncateName(fullName) {
    if (!fullName) return '';
    const words = fullName.trim().split(/\s+/);
    if (words.length <= 2) return fullName.trim();
    const firstTwo = words.slice(0, 2).join(' ');
    const initials = words.slice(2).map((w) => w.charAt(0).toUpperCase() + '.').join(' ');
    return firstTwo + ' ' + initials;
  }

  // ─── Orientation Modal ───
  function showOrientationModal() {
    const skip = localStorage.getItem('dc_orientation_skip');
    if (skip === 'true') return;
    if (orientationModal) orientationModal.classList.remove('hidden');
  }

  function hideOrientationModal() {
    if (orientationModal) orientationModal.classList.add('hidden');
    if (orientationDontShow && orientationDontShow.checked) {
      localStorage.setItem('dc_orientation_skip', 'true');
    }
  }

  if (orientationUnderstandBtn) {
    orientationUnderstandBtn.addEventListener('click', hideOrientationModal);
  }

  // ─── Smart Rotation for Landscape ───
  function updateOrientationStyles() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const profileText = document.querySelector('.profile-text');
    const counter = document.getElementById('moments-counter');
    if (profileText) profileText.classList.toggle('smart-rotate', isLandscape);
    if (counter) counter.classList.toggle('smart-rotate', isLandscape);
  }
  window.addEventListener('resize', updateOrientationStyles);
  window.addEventListener('orientationchange', updateOrientationStyles);

  // ─── Touch-to-Focus, Long-Press AE/AF Lock & Exposure ───
  function setupFocusOverlay() {
    if (!focusOverlay) return;
    let focusTimer = null;
    let tapStartX = 0;
    let tapStartY = 0;
    let longPressFired = false;

    function showFocusAt(x, y, locked) {
      focusBoxX = x;
      focusBoxY = y;
      focusActive = true;
      aeAfLocked = locked;
      if (focusBox) {
        focusBox.style.left = x + 'px';
        focusBox.style.top = y + 'px';
        focusBox.classList.remove('hidden');
      }
      if (exposureSlider) exposureSlider.classList.toggle('hidden', !locked);
      vibrate(locked ? 40 : 20);
      lockExposureAtPoint(x / viewfinder.getBoundingClientRect().width, y / viewfinder.getBoundingClientRect().height);
    }

    function hideFocus() {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = null;
      if (!aeAfLocked) {
        if (focusBox) focusBox.classList.add('hidden');
        if (exposureSlider) exposureSlider.classList.add('hidden');
        focusActive = false;
        unlockExposure();
      }
    }

    function onPointerDown(e) {
      if (e.target.closest('.vf-top') || e.target.closest('.vf-bottom')) return;
      if (aeAfLocked) {
        aeAfLocked = false;
        unlockExposure();
        if (focusBox) focusBox.classList.add('hidden');
        if (exposureSlider) exposureSlider.classList.add('hidden');
        focusActive = false;
      }
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = viewfinder.getBoundingClientRect();
      tapStartX = clientX - rect.left;
      tapStartY = clientY - rect.top;
      longPressFired = false;

      if (focusLongPressTimer) clearTimeout(focusLongPressTimer);
      focusLongPressTimer = setTimeout(() => {
        longPressFired = true;
        showFocusAt(tapStartX, tapStartY, true);
        if (focusTimer) clearTimeout(focusTimer);
      }, 1000);
    }

    function onPointerUp(e) {
      if (focusLongPressTimer) {
        clearTimeout(focusLongPressTimer);
        focusLongPressTimer = null;
      }
      if (longPressFired) return;
      if (e.target.closest('.vf-top') || e.target.closest('.vf-bottom')) return;

      const rect = viewfinder.getBoundingClientRect();
      showFocusAt(tapStartX, tapStartY, false);
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(hideFocus, 1500);
    }

    focusOverlay.addEventListener('mousedown', onPointerDown);
    focusOverlay.addEventListener('touchstart', onPointerDown, { passive: true });
    focusOverlay.addEventListener('mouseup', onPointerUp);
    focusOverlay.addEventListener('touchend', onPointerUp);

    focusOverlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Exposure drag
    if (exposureThumb) {
      exposureThumb.addEventListener('mousedown', (e) => {
        if (!aeAfLocked) return;
        e.preventDefault();
        exposureDragging = true;
        exposureStartY = e.clientY;
        exposureStartLevel = exposureLevel;
      });
      exposureThumb.addEventListener('touchstart', (e) => {
        if (!aeAfLocked || e.touches.length !== 1) return;
        e.preventDefault();
        exposureDragging = true;
        exposureStartY = e.touches[0].clientY;
        exposureStartLevel = exposureLevel;
      }, { passive: false });
    }

    document.addEventListener('mousemove', (e) => {
      if (!exposureDragging) return;
      const deltaY = exposureStartY - e.clientY;
      const range = 140;
      const delta = deltaY / range;
      exposureLevel = Math.max(0, Math.min(1, exposureStartLevel + delta));
      if (exposureThumb) exposureThumb.style.bottom = (exposureLevel * 100) + '%';
      applyExposureLevel(exposureLevel);
    });
    document.addEventListener('touchmove', (e) => {
      if (!exposureDragging || e.touches.length !== 1) return;
      const deltaY = exposureStartY - e.touches[0].clientY;
      const range = 140;
      const delta = deltaY / range;
      exposureLevel = Math.max(0, Math.min(1, exposureStartLevel + delta));
      if (exposureThumb) exposureThumb.style.bottom = (exposureLevel * 100) + '%';
      applyExposureLevel(exposureLevel);
    }, { passive: false });
    document.addEventListener('mouseup', () => { exposureDragging = false; });
    document.addEventListener('touchend', () => { exposureDragging = false; });
  }

  async function lockExposureAtPoint(xNorm, yNorm) {
    if (!mediaStream) return;
    const track = mediaStream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities();
    if (!caps.exposureMode) return;
    try {
      await track.applyConstraints({
        advanced: [{ exposureMode: 'manual' }]
      });
    } catch (e) {}
  }

  async function unlockExposure() {
    if (!mediaStream) return;
    const track = mediaStream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities();
    if (!caps.exposureMode) return;
    try {
      await track.applyConstraints({
        advanced: [{ exposureMode: 'continuous' }]
      });
    } catch (e) {}
    exposureLevel = 0.5;
    if (exposureThumb) exposureThumb.style.bottom = '50%';
  }

  async function applyExposureLevel(level) {
    if (!mediaStream) return;
    const track = mediaStream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities();
    if (caps.exposureCompensation) {
      const min = caps.exposureCompensation.min || -3;
      const max = caps.exposureCompensation.max || 3;
      const val = min + (max - min) * level;
      try {
        await track.applyConstraints({
          advanced: [{ exposureCompensation: val }]
        });
      } catch (e) {}
    }
  }

  // ─── Event Config ───
  async function loadEventConfig() {
    try {
      const res = await fetch(api('event-config'));
      if (!res.ok) return;
      const cfg = await res.json();
      if (welcomeEventName) welcomeEventName.textContent = cfg.eventName || 'The Moments';
      if (welcomeEventSubtitle) welcomeEventSubtitle.textContent = cfg.eventSubtitle || 'Retreat Event';
      if (welcomeCover && cfg.coverImage) {
        welcomeCover.style.backgroundImage = `url('${url('uploads/' + cfg.coverImage)}')`;
      }
    } catch (e) {}
  }

  // ─── Gallery thumb ───
  function updateGalleryThumbnail(photos) {
    const latest = photos && photos.find((p) => p.fileType === 'photo');
    if (galleryThumb) {
      if (latest) {
        galleryThumb.classList.add('has-photo');
        galleryThumb.style.backgroundImage = `url('${url('uploads/' + latest.filename)}')`;
      } else {
        galleryThumb.classList.remove('has-photo');
        galleryThumb.style.backgroundImage = '';
      }
    }
  }

  function releaseMediaStream() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (e) {}
    }
    mediaRecorder = null;
    isRecording = false;
    if (tlIntervalId) {
      clearInterval(tlIntervalId);
      tlIntervalId = null;
    }
    tlCapturing = false;
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (video) video.srcObject = null;
    aeAfLocked = false;
    focusActive = false;
    if (focusBox) focusBox.classList.add('hidden');
    if (exposureSlider) exposureSlider.classList.add('hidden');
  }

  function applyCaptionOverlay(parent, caption, yPercent) {
    if (!caption) return;
    const capEl = document.createElement('div');
    capEl.className = 'gallery-caption-overlay snap-caption-bar';
    capEl.style.top = (yPercent != null ? yPercent : 50) + '%';
    capEl.innerHTML = `<span>${escapeHtml(caption)}</span>`;
    parent.appendChild(capEl);
  }

  function detectLandscapeMedia(el) {
    if (!el) return false;
    if (el.videoWidth && el.videoHeight) return el.videoWidth > el.videoHeight;
    if (el.naturalWidth && el.naturalHeight) return el.naturalWidth > el.naturalHeight;
    return false;
  }

  async function refreshGalleryThumb() {
    if (!currentUser) return;
    try {
      const res = await fetch(api('gallery/' + encodeURIComponent(currentUser.participantNumber)));
      if (res.ok) {
        const photos = await res.json();
        updateGalleryThumbnail(photos);
        momentsCaptured = photos.length;
        updateMomentsDisplay();
      }
    } catch (e) {}
  }

  window.fetchUserGallery = async function () {
    if (!currentUser) return [];
    const res = await fetch(api('gallery/' + encodeURIComponent(currentUser.participantNumber)));
    if (!res.ok) throw new Error('Gallery unavailable');
    return res.json();
  };

  function updateMomentsDisplay() {
    if (!momentsCounter || !momentsCount) return;
    momentsCount.textContent = momentsCaptured;
    if (momentsCaptured > 0) {
      momentsCounter.classList.remove('hidden');
    } else {
      momentsCounter.classList.add('hidden');
    }
  }

  function downloadMedia(p) {
    const a = document.createElement('a');
    a.href = url('uploads/' + p.filename);
    a.download = p.originalName || p.filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ─── Registration ───
  function checkSession() {
    loadEventConfig();
    const saved = localStorage.getItem('dc_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.participantNumber && parsed.fullName && parsed.gender) {
          currentUser = parsed;
          showApp();
        } else {
          localStorage.removeItem('dc_user');
        }
      } catch (e) { localStorage.removeItem('dc_user'); }
    }
    showOrientationModal();
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
    const displayName = truncateName(currentUser.fullName);
    userName.textContent = displayName;
    userNumber.textContent = `#${currentUser.participantNumber}`;
    const genderNorm = (currentUser.gender || '').toString().trim().toUpperCase();
    const isMale = genderNorm === 'L' || genderNorm.startsWith('LAKI');
    genderIcon.className = `gender-icon ${isMale ? 'male' : 'female'}`;
    genderIcon.innerHTML = `<img src="${url('images/' + (isMale ? 'male' : 'female') + '-icon.svg')}" alt="">`;
    initCamera();
    setupZoomGestures();
    setupFocusOverlay();
    listenForRevocation();
    refreshGalleryThumb();
    updateOrientationStyles();
    if (typeof initChat === 'function') initChat(currentUser);
  }

  function listenForRevocation() {
    if (typeof io === 'undefined') return;
    const socket = io({ path: BASE + 'socket.io' });
    socket.on('participant-revoked', (data) => {
      if (data.participantNumber === currentUser.participantNumber) {
        showMicroToast('Session ended — access revoked');
        setTimeout(() => { localStorage.removeItem('dc_user'); location.reload(); }, 2000);
      }
    });
    socket.on('event-reset', () => {
      showMicroToast('Event data has been reset by admin');
      momentsCaptured = 0;
      updateMomentsDisplay();
      refreshGalleryThumb();
    });
    socket.on('new-upload', (data) => {
      if (data.participantNumber === currentUser.participantNumber) {
        momentsCaptured++;
        updateMomentsDisplay();
      }
    });
  }

  logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
      releaseMediaStream();
      localStorage.removeItem('dc_user');
      location.reload();
    }
  });

  // ─── Settings Panel ───
  settingsBtn.addEventListener('click', () => {
    vibrate(20);
    settingsPanel.classList.remove('hidden');
    settingsPanel.classList.add('visible');
    settingsBtn.classList.add('active');
  });
  settingsClose.addEventListener('click', () => {
    settingsPanel.classList.remove('visible');
    setTimeout(() => settingsPanel.classList.add('hidden'), 350);
    settingsBtn.classList.remove('active');
  });

  function setGridEnabled(on) {
    gridEnabled = on;
    if (gridOff) gridOff.classList.toggle('active', !on);
    if (gridOn) gridOn.classList.toggle('active', on);
    gridOverlay.classList.toggle('hidden', !on);
  }

  function setContinuousMode(on) {
    continuousMode = on;
    if (shootSingle) shootSingle.classList.toggle('active', !on);
    if (shootContinuous) shootContinuous.classList.toggle('active', on);
  }

  if (gridOff) {
    gridOff.addEventListener('click', () => { vibrate(15); setGridEnabled(false); });
  }
  if (gridOn) {
    gridOn.addEventListener('click', () => { vibrate(15); setGridEnabled(true); });
  }
  if (shootSingle) {
    shootSingle.addEventListener('click', () => {
      vibrate(15);
      setContinuousMode(false);
      showMicroToast('Shooting mode: Single');
    });
  }
  if (shootContinuous) {
    shootContinuous.addEventListener('click', () => {
      vibrate(15);
      setContinuousMode(true);
      showMicroToast('Shooting mode: Continuous — photos queue to drafts');
    });
  }

  setGridEnabled(false);
  setContinuousMode(false);

  document.querySelectorAll('.timer-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      vibrate(15);
      timerSeconds = parseInt(btn.dataset.seconds, 10);
      document.querySelectorAll('.timer-opt').forEach((b) => b.classList.toggle('active', b === btn));
      showMicroToast(timerSeconds === 0 ? 'Timer off' : `${timerSeconds}s timer set`);
    });
  });

  document.querySelectorAll('.tl-interval').forEach((btn) => {
    btn.addEventListener('click', () => {
      vibrate(15);
      tlInterval = parseInt(btn.dataset.interval, 10);
      document.querySelectorAll('.tl-interval').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // ─── Modes Bar (portrait + landscape sidebar) ───
  function handleModeChange(newMode, allModePills) {
    vibrate(20);
    if (newMode === currentMode) return;
    if (isRecording) stopRecording();
    if (tlCapturing) stopTimelapse();
    currentMode = newMode;
    // Sync all mode pills (portrait + landscape)
    document.querySelectorAll('.mode-pill').forEach((b) => b.classList.toggle('active', b.dataset.mode === newMode));
    captureBtn.classList.toggle('video-mode', currentMode === 'video' || currentMode === 'timelapse');
    releaseMediaStream();
    initCamera(false);
    showMicroToast(newMode.toUpperCase() + ' mode');
  }

  document.querySelectorAll('.mode-pill').forEach((btn) => {
    btn.addEventListener('click', () => handleModeChange(btn.dataset.mode));
  });

  // ─── Zoom Presets ───
  function handleZoomPreset(preset) {
    vibrate(15);
    currentZoomPreset = preset;
    // Sync all zoom preset buttons
    document.querySelectorAll('.zoom-preset-btn').forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.zoom) === preset));
    setZoomPreset(preset);
  }

  document.querySelectorAll('.zoom-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleZoomPreset(parseFloat(btn.dataset.zoom)));
  });

  async function setZoomPreset(preset) {
    if (preset === 0.5) {
      await tryUltraWideCamera();
    } else {
      if (currentZoomPreset === 0.5) {
        // Switch back from ultrawide to main camera
        await initCamera(false);
      }
      setZoom(preset);
    }
  }

  // ─── Camera ───
  async function tryUltraWideCamera() {
    try {
      releaseMediaStream();

      // Try native ultra-wide via facingMode + zoom constraint
      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          zoom: { ideal: 0.5 }
        },
        audio: currentMode === 'video'
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStream = stream;
        video.srcObject = stream;
        // Apply native zoom if supported
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom && caps.zoom.min <= 0.6) {
          try { await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }); } catch (e) {}
        }
        applyMirror();
        applyFlash();
        zoomLevel = 1; // Reset CSS zoom — native handles it
        zoomLayer.style.transform = 'scale(1)';
        return;
      } catch (e) {}

      // Fallback: enumerate devices and pick widest angle
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      if (videoDevices.length > 1 && currentFacingMode === 'environment') {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: videoDevices[videoDevices.length - 1].deviceId }, width: { ideal: 1920 } },
          audio: currentMode === 'video'
        });
        mediaStream = stream;
        video.srcObject = stream;
        applyMirror();
        zoomLevel = 1;
        zoomLayer.style.transform = 'scale(1)';
        return;
      }

      // CSS fallback — zoom out slightly but clamp so no black borders
      await initCamera(false);
      setZoom(0.9); // closest we can get without black borders
      showMicroToast('Ultra-wide not available on this device');
    } catch (err) {
      await initCamera(false);
    }
  }

  async function initCamera(requestUltraWide) {
    try {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
      if (video && video.srcObject) video.srcObject = null;
      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: currentMode === 'video'
      };
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = mediaStream;
      applyMirror();
      applyFlash();
      // Reset CSS zoom when reinitializing — prevents stale scale
      zoomLayer.style.transform = 'scale(1)';
      zoomLevel = 1;
    } catch (err) {
      console.error('Camera error:', err);
    }
  }

  function applyMirror() {
    const auto = currentFacingMode === 'user';
    const on = mirrorOverride === null ? auto : mirrorOverride;
    video.classList.toggle('mirrored', on);
  }

  async function applyFlash() {
    if (!mediaStream) return;
    const track = mediaStream.getVideoTracks()[0];
    if (!track) return;
    const torchOn = flashMode === 'on';
    try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) {}
  }

  flashBtn.addEventListener('click', () => {
    vibrate(20);
    const modes = ['off', 'on', 'auto'];
    flashMode = modes[(modes.indexOf(flashMode) + 1) % modes.length];
    flashBtn.dataset.mode = flashMode;
    flashBtn.querySelector('.flash-off').classList.toggle('hidden', flashMode === 'on');
    flashBtn.querySelector('.flash-on').classList.toggle('hidden', flashMode !== 'on');
    if (flashMode === 'on' || flashMode === 'off') applyFlash();
  });

  rotateBtn.addEventListener('click', () => {
    vibrate(30);
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    mirrorOverride = null;
    currentZoomPreset = 1;
    document.querySelectorAll('.zoom-preset-btn').forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.zoom) === 1));
    releaseMediaStream();
    initCamera(false);
  });

  // ─── Zoom — clamped to prevent black borders ───
  function setZoom(level) {
    // Minimum 1.0 prevents CSS scaling below 100% which causes black borders
    // Maximum 6x for digital zoom
    zoomLevel = Math.min(Math.max(level, 1.0), 6);
    zoomLayer.style.transform = `scale(${zoomLevel})`;
    const zoomPill = document.getElementById('zoom-indicator');
    if (zoomPill) {
      if (zoomLevel !== 1) {
        zoomPill.textContent = zoomLevel.toFixed(1) + '×';
        zoomPill.classList.remove('hidden');
      } else {
        zoomPill.classList.add('hidden');
      }
    }
  }

  function resetZoom() {
    setZoom(1);
    const zoomPill = document.getElementById('zoom-indicator');
    if (zoomPill) zoomPill.classList.add('hidden');
  }

  const zoomPillBtn = document.getElementById('zoom-indicator');
  if (zoomPillBtn) zoomPillBtn.addEventListener('click', () => { vibrate(15); resetZoom(); });

  function setupZoomGestures() {
    viewfinder.addEventListener('touchstart', onTouchStart, { passive: false });
    viewfinder.addEventListener('touchmove', onTouchMove, { passive: false });
    viewfinder.addEventListener('touchend', onTouchEnd);
    viewfinder.addEventListener('dblclick', (e) => {
      e.preventDefault(); vibrate(20);
      setZoom(zoomLevel > 1.1 ? 1 : 2);
    });
  }

  function touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchStartDist = touchDist(e.touches);
      pinchStartZoom = zoomLevel;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        e.preventDefault();
        setZoom(zoomLevel > 1.1 ? 1 : 2);
        lastTapTime = 0;
      } else { lastTapTime = now; }
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDist(e.touches);
      const rawZoom = pinchStartZoom * (dist / pinchStartDist);
      setZoom(rawZoom); // setZoom already clamps to min 1.0
    }
  }

  function onTouchEnd() { pinchStartDist = 0; }

  // ─── Capture (timer-aware) ───
  function handleCaptureTrigger() {
    if (currentMode === 'timelapse') {
      tlCapturing ? stopTimelapse() : startTimelapse();
      return;
    }
    if (currentMode === 'video') {
      isRecording ? stopRecording() : startRecordingWithTimer();
      return;
    }
    if (timerSeconds > 0 && !timerActive) {
      startTimerThenCapture();
    } else if (!timerActive) {
      takePhoto();
    }
  }

  captureBtn.addEventListener('click', handleCaptureTrigger);

  // Long-press for video
  captureBtn.addEventListener('touchstart', () => {
    if (currentMode !== 'photo') return;
    longPressTimer = setTimeout(() => {
      document.querySelectorAll('.mode-pill').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'video'));
      currentMode = 'video';
      captureBtn.classList.add('video-mode');
      releaseMediaStream();
      initCamera(false).then(() => startRecording());
    }, 800);
  }, { passive: true });
  captureBtn.addEventListener('touchend', () => clearTimeout(longPressTimer));
  captureBtn.addEventListener('touchcancel', () => clearTimeout(longPressTimer));

  // ─── Self Timer ───
  function startTimerThenCapture() {
    timerActive = true;
    let count = timerSeconds;
    timerCountdownEl.textContent = count;
    timerCountdownEl.classList.remove('hidden');
    vibrate(30);

    timerCountdownId = setInterval(() => {
      count--;
      if (count > 0) {
        timerCountdownEl.textContent = count;
        playTimerBeep(false);
        vibrate(20);
        timerCountdownEl.style.animation = 'none';
        timerCountdownEl.offsetHeight;
        timerCountdownEl.style.animation = '';
      } else {
        clearInterval(timerCountdownId);
        timerCountdownEl.classList.add('hidden');
        timerActive = false;
        playTimerBeep(true);
        takePhoto();
      }
    }, 1000);
  }

  function startRecordingWithTimer() {
    if (timerSeconds > 0 && !timerActive) {
      timerActive = true;
      let count = timerSeconds;
      timerCountdownEl.textContent = count;
      timerCountdownEl.classList.remove('hidden');
      timerCountdownId = setInterval(() => {
        count--;
        if (count > 0) {
          timerCountdownEl.textContent = count;
          playTimerBeep(false);
          timerCountdownEl.style.animation = 'none';
          timerCountdownEl.offsetHeight;
          timerCountdownEl.style.animation = '';
        } else {
          clearInterval(timerCountdownId);
          timerCountdownEl.classList.add('hidden');
          timerActive = false;
          startRecording();
        }
      }, 1000);
    } else if (!timerActive) {
      startRecording();
    }
  }

  // ─── Take Photo ───
  async function takePhoto() {
    if (isCapturing) return;
    isCapturing = true;

    try {
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise((resolve) => {
          if (video.videoWidth) return resolve();
          const onReady = () => { video.removeEventListener('loadeddata', onReady); resolve(); };
          video.addEventListener('loadeddata', onReady);
          setTimeout(resolve, 150);
        });
      }

      vibrate(50);
      playShutterSound();

      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (video.classList.contains('mirrored')) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, w, h);

      const flashPromise = (flashMode === 'on' || flashMode === 'auto') ? applyFlash() : Promise.resolve();
      flashPromise.catch(() => {});

      canvas.toBlob((blob) => {
        isCapturing = false;
        if (!blob) {
          showMicroToast('Capture failed — try again');
          return;
        }
        if (continuousMode) {
          addToDraftQueue(blob, 'photo.jpg', 'image/jpeg');
        } else {
          showReviewScreen(blob, 'photo.jpg', 'image/jpeg', false);
        }
        if (flashMode === 'auto') {
          setTimeout(() => {
            flashMode = 'off';
            flashBtn.dataset.mode = 'off';
            flashBtn.querySelector('.flash-off').classList.remove('hidden');
            flashBtn.querySelector('.flash-on').classList.add('hidden');
            applyFlash();
          }, 300);
        }
      }, 'image/jpeg', 0.92);
    } catch (err) {
      isCapturing = false;
      console.error('Photo capture error:', err);
      showMicroToast('Capture failed — try again');
    }
  }

  // ─── Video Recording ───
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
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      recordedChunks = [];
      if (continuousMode) addToDraftQueue(blob, 'video.webm', blob.type);
      else showReviewScreen(blob, 'video.webm', blob.type, true);
    };
    mediaRecorder.start(100);
    isRecording = true;
    captureBtn.classList.add('recording');
    recordingIndicator.classList.remove('hidden');
    recStart = Date.now();
    recTimer.textContent = '00:00';
    recTimerId = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      recTimer.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
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

  // ─── Timelapse ───
  function startTimelapse() {
    if (!mediaStream) return;
    tlCapturing = true;
    tlFrames = [];
    tlFrameCount = 0;
    captureBtn.classList.add('recording');
    tlIndicator.classList.remove('hidden');
    tlFrameCountEl.textContent = '0';
    vibrate([50, 50, 50]);
    showMicroToast(`Timelapse started — ${tlInterval}s intervals`);
    captureTlFrame();
    tlIntervalId = setInterval(captureTlFrame, tlInterval * 1000);
  }

  function captureTlFrame() {
    if (!video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    if (video.classList.contains('mirrored')) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    tlFrames.push(c);
    tlFrameCount++;
    if (tlFrameCountEl) tlFrameCountEl.textContent = tlFrameCount;
    vibrate(10);
  }

  async function stopTimelapse() {
    clearInterval(tlIntervalId);
    tlIntervalId = null;
    tlCapturing = false;
    captureBtn.classList.remove('recording');
    tlIndicator.classList.add('hidden');
    vibrate(100);

    if (tlFrames.length < 2) { showMicroToast('Not enough frames for timelapse'); return; }
    showMicroToast(`Rendering ${tlFrames.length} frames…`);

    try {
      const frames = tlFrames.slice();
      tlFrames = [];
      const blob = await renderTimelapseVideo(frames, 24);
      showReviewScreen(blob, 'timelapse.webm', 'video/webm', true);
    } catch (e) {
      console.error('[TIMELAPSE ERROR]: ', e);
      showMicroToast('Timelapse render failed');
      tlFrames = [];
    }
  }

  function renderTimelapseVideo(frames, fps) {
    return new Promise((resolve, reject) => {
      if (!frames || frames.length < 2) {
        reject(new Error('Not enough frames'));
        return;
      }
      const w = frames[0].width || 640;
      const h = frames[0].height || 480;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = w;
      outCanvas.height = h;
      const ctx = outCanvas.getContext('2d');

      let rec = null;
      let stream = null;
      try {
        stream = outCanvas.captureStream(fps);
      } catch (e) {
        reject(new Error('Canvas captureStream not supported'));
        return;
      }

      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          try {
            rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
            break;
          } catch (e) {}
        }
      }
      if (!rec) {
        try { rec = new MediaRecorder(stream); } catch (e) { reject(e); return; }
      }

      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 2) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (chunks.length > 0) {
          resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
        } else {
          reject(new Error('No video data recorded'));
        }
      };
      rec.onerror = (e) => reject(e || new Error('MediaRecorder error'));

      rec.start(500);

      let i = 1;
      const frameDuration = Math.max(1000 / fps, 16);
      let drawnCount = 1;

      function drawNextFrame() {
        if (i >= frames.length) {
          if (rec.state !== 'inactive') {
            try { rec.requestData(); } catch (e) {}
            setTimeout(() => {
              try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
            }, 400);
          }
          return;
        }
        const f = frames[i];
        if (!f || !f.width) { i++; drawNextFrame(); return; }
        ctx.clearRect(0, 0, w, h);
        try {
          ctx.drawImage(f, 0, 0, w, h);
          drawnCount++;
        } catch (e) {
          i++;
          drawNextFrame();
          return;
        }
        i++;
        setTimeout(drawNextFrame, frameDuration);
      }

      // Wait a tick for recorder to start, then draw first frame and begin sequence
      setTimeout(() => {
        try {
          ctx.drawImage(frames[0], 0, 0, w, h);
        } catch (e) {}
        setTimeout(drawNextFrame, frameDuration);
      }, 50);
    });
  }

  // ─── Draft Queue ───
  function addToDraftQueue(blob, filename, mimetype) {
    const objUrl = URL.createObjectURL(blob);
    draftQueue.push({ blob, filename, mimetype, objUrl, caption: '', snapBarY: 50 });
    updateDraftBadge();
    vibrate(30);
    playShutterSound();
    showMicroToast(`Draft #${draftQueue.length} queued`);
  }

  function updateDraftBadge() {
    if (draftQueue.length > 0) {
      draftCount.textContent = draftQueue.length;
      draftBadge.classList.remove('hidden');
    } else {
      draftBadge.classList.add('hidden');
    }
  }

  draftBadge.addEventListener('click', openDraftPanel);
  draftBadge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openDraftPanel(); });

  draftPanelClose.addEventListener('click', () => draftReviewPanel.classList.add('hidden'));

  draftDiscardAll.addEventListener('click', () => {
    if (!confirm('Discard all drafts?')) return;
    draftQueue.forEach(d => URL.revokeObjectURL(d.objUrl));
    draftQueue = [];
    updateDraftBadge();
    draftReviewPanel.classList.add('hidden');
    showMicroToast('All drafts discarded');
  });

  draftUploadAll.addEventListener('click', async () => {
    if (!draftQueue.length) return;
    draftReviewPanel.classList.add('hidden');
    const items = [...draftQueue];
    draftQueue = [];
    updateDraftBadge();
    showMicroToast(`Uploading ${items.length} items…`);
    for (const item of items) {
      const yPos = item.snapBarY != null ? item.snapBarY : 50;
      await uploadMedia(item.blob, item.filename, item.mimetype, item.caption, yPos < 50 ? 'top' : 'bottom', yPos);
      URL.revokeObjectURL(item.objUrl);
    }
    refreshGalleryThumb();
  });

  draftUploadCurrent.addEventListener('click', async () => {
    if (!draftQueue.length) return;
    const item = draftQueue[draftViewIndex];
    if (!item) return;
    // Save current caption
    item.caption = draftCaptionInput.value.trim();
    draftReviewPanel.classList.add('hidden');
    await uploadMedia(item.blob, item.filename, item.mimetype, item.caption,
      (item.snapBarY != null && item.snapBarY < 50) ? 'top' : 'bottom',
      item.snapBarY != null ? item.snapBarY : 50);
    URL.revokeObjectURL(item.objUrl);
    draftQueue.splice(draftViewIndex, 1);
    updateDraftBadge();
    if (draftQueue.length === 0) {
      refreshGalleryThumb();
    } else {
      draftViewIndex = Math.min(draftViewIndex, draftQueue.length - 1);
      openDraftPanel();
    }
    refreshGalleryThumb();
  });

  draftDeleteCurrent.addEventListener('click', () => {
    if (!draftQueue.length) return;
    const item = draftQueue[draftViewIndex];
    if (!item) return;
    URL.revokeObjectURL(item.objUrl);
    draftQueue.splice(draftViewIndex, 1);
    updateDraftBadge();
    if (draftQueue.length === 0) {
      draftReviewPanel.classList.add('hidden');
      showMicroToast('Draft deleted');
    } else {
      draftViewIndex = Math.min(draftViewIndex, draftQueue.length - 1);
      renderDraftViewer();
    }
  });

  draftPrev.addEventListener('click', () => {
    if (draftViewIndex > 0) {
      saveDraftCaption();
      draftViewIndex--;
      renderDraftViewer();
    }
  });

  draftNext.addEventListener('click', () => {
    if (draftViewIndex < draftQueue.length - 1) {
      saveDraftCaption();
      draftViewIndex++;
      renderDraftViewer();
    }
  });

  draftCaptionInput.addEventListener('input', () => {
    const text = draftCaptionInput.value.trim();
    draftSnapText.textContent = text;
    draftSnapBar.style.display = text ? 'flex' : 'none';
    draftViewerHint.classList.toggle('hidden', !!text);
    if (draftQueue[draftViewIndex]) draftQueue[draftViewIndex].caption = text;
  });

  function saveDraftCaption() {
    if (draftQueue[draftViewIndex]) {
      draftQueue[draftViewIndex].caption = draftCaptionInput.value.trim();
      const barTopPct = parseFloat(draftSnapBar.style.top) || 50;
      draftQueue[draftViewIndex].snapBarY = barTopPct;
    }
  }

  function openDraftPanel() {
    if (!draftQueue.length) return;
    draftViewIndex = Math.min(draftViewIndex, draftQueue.length - 1);
    draftPanelCount.textContent = `${draftQueue.length} photo${draftQueue.length !== 1 ? 's' : ''}`;
    renderDraftViewer();
    draftReviewPanel.classList.remove('hidden');
  }

  function renderDraftViewer() {
    const item = draftQueue[draftViewIndex];
    if (!item) return;

    draftPanelCount.textContent = `${draftQueue.length} photo${draftQueue.length !== 1 ? 's' : ''}`;
    draftItemCounter.textContent = `${draftViewIndex + 1} / ${draftQueue.length}`;

    // Render media
    draftViewerMedia.innerHTML = '';
    const isVideo = item.mimetype && item.mimetype.startsWith('video');
    if (isVideo) {
      const v = document.createElement('video');
      v.src = item.objUrl; v.controls = true; v.autoplay = true;
      v.muted = true; v.playsInline = true; v.loop = true;
      draftViewerMedia.appendChild(v);
      v.addEventListener('loadedmetadata', () => {
        draftViewerMedia.classList.toggle('landscape-media', detectLandscapeMedia(v));
      });
    } else {
      const img = document.createElement('img');
      img.src = item.objUrl;
      img.decoding = 'async';
      img.addEventListener('load', () => {
        draftViewerMedia.classList.toggle('landscape-media', detectLandscapeMedia(img));
      });
      draftViewerMedia.appendChild(img);
    }

    // Caption bar
    const caption = item.caption || '';
    draftCaptionInput.value = caption;
    draftSnapText.textContent = caption;
    const barY = item.snapBarY !== undefined ? item.snapBarY : 50;
    draftSnapBar.style.top = barY + '%';
    draftSnapBar.style.display = caption ? 'flex' : 'none';
    draftViewerHint.classList.toggle('hidden', !!caption);

    // Nav buttons
    draftPrev.style.display = draftViewIndex > 0 ? 'flex' : 'none';
    draftNext.style.display = draftViewIndex < draftQueue.length - 1 ? 'flex' : 'none';
  }

  // ─── Draft snap bar drag ───
  setupSnapBarDrag(draftSnapBar, {
    getY: () => parseFloat(draftSnapBar.style.top) || 50,
    setY: (pct) => {
      draftSnapBar.style.top = pct + '%';
      if (draftQueue[draftViewIndex]) draftQueue[draftViewIndex].snapBarY = pct;
    },
    getContainer: () => draftSnapBar.parentElement
  });

  // ─── Review Screen ───
  function showReviewScreen(blob, filename, mimetype, isVideo) {
    pendingCapture = { blob, filename, mimetype, isVideo };
    reviewCaptionInput.value = '';
    snapCaptionText.textContent = '';
    snapCaptionBar.style.display = 'none';
    snapBarY = 50;
    snapCaptionBar.style.top = '50%';
    snapTapHint.classList.remove('hidden');

    reviewMedia.innerHTML = '';
    const objUrl = URL.createObjectURL(blob);
    if (isVideo) {
      const v = document.createElement('video');
      v.src = objUrl; v.controls = true; v.autoplay = true;
      v.muted = true; v.playsInline = true; v.loop = true;
      reviewMedia.appendChild(v);
      v.addEventListener('loadedmetadata', () => {
        reviewMedia.classList.toggle('landscape-media', detectLandscapeMedia(v));
      });
    } else {
      const img = document.createElement('img');
      img.src = objUrl;
      img.decoding = 'async';
      img.addEventListener('load', () => {
        reviewMedia.classList.toggle('landscape-media', detectLandscapeMedia(img));
      });
      reviewMedia.appendChild(img);
    }

    reviewScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
  }

  // ─── Snap Caption Bar (full-width, vertical drag only) ───
  reviewCaptionInput.addEventListener('input', () => {
    const text = reviewCaptionInput.value.trim();
    if (text) {
      snapCaptionText.textContent = text;
      snapCaptionBar.style.display = 'flex';
      snapTapHint.classList.add('hidden');
    } else {
      snapCaptionText.textContent = '';
      snapCaptionBar.style.display = 'none';
      snapTapHint.classList.remove('hidden');
    }
  });

  // Generic vertical drag setup for full-width caption bars
  function setupSnapBarDrag(barEl, opts) {
    let dragging = false;
    let startClientY = 0;
    let startTopPct = 50;

    function getTopPercent(clientY, deltaY) {
      const container = opts.getContainer();
      const rect = container.getBoundingClientRect();
      const newTopPx = (startTopPct / 100) * rect.height + deltaY;
      const pct = (newTopPx / rect.height) * 100;
      return Math.max(3, Math.min(97, pct));
    }

    barEl.addEventListener('mousedown', (e) => {
      dragging = true;
      startClientY = e.clientY;
      startTopPct = opts.getY();
      e.preventDefault();
    });

    barEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      dragging = true;
      startClientY = e.touches[0].clientY;
      startTopPct = opts.getY();
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const pct = getTopPercent(e.clientY, e.clientY - startClientY);
      opts.setY(pct);
    });

    document.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const pct = getTopPercent(e.touches[0].clientY, e.touches[0].clientY - startClientY);
      opts.setY(pct);
    }, { passive: false });

    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('touchend', () => { dragging = false; });
  }

  setupSnapBarDrag(snapCaptionBar, {
    getY: () => snapBarY,
    setY: (pct) => { snapBarY = pct; snapCaptionBar.style.top = pct + '%'; },
    getContainer: () => snapCaptionBar.parentElement
  });

  reviewDiscardBtn.addEventListener('click', () => {
    pendingCapture = null;
    reviewMedia.innerHTML = '';
    snapCaptionBar.style.display = 'none';
    reviewScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
  });

  reviewUploadBtn.addEventListener('click', () => {
    if (!pendingCapture) return;
    const { blob, filename, mimetype } = pendingCapture;
    const caption = reviewCaptionInput.value.trim();
    reviewScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
    reviewMedia.innerHTML = '';
    const capY = snapBarY;
    uploadMedia(blob, filename, mimetype, caption, capY < 50 ? 'top' : 'bottom', capY);
    pendingCapture = null;
  });

  // ─── Upload ───
  async function uploadMedia(blob, filename, mimetype, caption, capPos, capY) {
    uploadProgress.classList.remove('hidden');
    progressFill.style.width = '30%';

    const formData = new FormData();
    formData.append('media', blob, filename);
    formData.append('participantNumber', currentUser.participantNumber);
    formData.append('fullName', currentUser.fullName);
    formData.append('gender', currentUser.gender);
    formData.append('caption', caption || '');
    formData.append('captionPosition', capPos || 'bottom');
    formData.append('captionYOffset', String(capY != null ? capY : 50));

    const isVideo = mimetype && mimetype.startsWith('video');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isVideo ? 120000 : 60000);

    try {
      progressFill.style.width = '60%';
      const res = await fetch(api('upload'), { method: 'POST', body: formData, signal: controller.signal });
      clearTimeout(timeoutId);
      progressFill.style.width = '90%';
      const data = await res.json();
      if (res.ok) {
        vibrate([50, 30, 50]);
        progressFill.style.width = '100%';
        momentsCaptured++;
        updateMomentsDisplay();
        refreshGalleryThumb();
        setTimeout(() => { uploadProgress.classList.add('hidden'); progressFill.style.width = '0'; }, 800);
      } else {
        showMicroToast(data.error || (isVideo ? 'Video upload failed' : 'Upload failed'));
        uploadProgress.classList.add('hidden'); progressFill.style.width = '0';
      }
    } catch (err) {
      clearTimeout(timeoutId);
      showMicroToast(isVideo ? 'Video upload failed — check connection' : 'Upload failed — check connection');
      uploadProgress.classList.add('hidden'); progressFill.style.width = '0';
    }
  }

  // ─── Gallery Modal ───
  const TRASH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  const DOWNLOAD_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  galleryBtn.addEventListener('click', () => { vibrate(20); loadGallery(); galleryModal.classList.remove('hidden'); });
  galleryModalClose.addEventListener('click', () => galleryModal.classList.add('hidden'));
  galleryModal.addEventListener('click', (e) => { if (e.target === galleryModal) galleryModal.classList.add('hidden'); });

  async function loadGallery() {
    if (!currentUser) return;
    try {
      const res = await fetch(api('gallery/' + encodeURIComponent(currentUser.participantNumber)));
      const photos = await res.json();
      galleryGrid.innerHTML = '';
      if (!photos.length) { galleryEmpty.classList.remove('hidden'); updateGalleryThumbnail([]); return; }
      galleryEmpty.classList.add('hidden');
      updateGalleryThumbnail(photos);

      photos.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        const mediaWrap = document.createElement('div');
        mediaWrap.style.cssText = 'position:relative;width:100%;height:100%;';
        if (p.fileType === 'video') {
          const vid = document.createElement('video');
          vid.src = url('uploads/' + p.filename);
          vid.muted = true;
          vid.preload = 'metadata';
          mediaWrap.appendChild(vid);
          const badge = document.createElement('span');
          badge.className = 'video-badge';
          badge.textContent = '▶';
          mediaWrap.appendChild(badge);
        } else {
          const img = document.createElement('img');
          img.src = url('uploads/' + p.filename);
          img.alt = 'Photo';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.addEventListener('load', () => {
            if (img.naturalWidth > img.naturalHeight) item.classList.add('landscape-item');
          });
          mediaWrap.appendChild(img);
        }
        if (p.caption) {
          applyCaptionOverlay(mediaWrap, p.caption, p.captionYOffset != null ? p.captionYOffset : (p.captionPosition === 'top' ? 25 : 75));
        }
        item.appendChild(mediaWrap);

        const actions = document.createElement('div');
        actions.className = 'item-actions';
        actions.innerHTML = `<button class="download-btn" title="Download">${DOWNLOAD_SVG}</button><button class="delete-btn" data-id="${p._id}" title="Delete">${TRASH_SVG}</button>`;
        item.appendChild(actions);
        item.addEventListener('click', (e) => {
          if (e.target.closest('.delete-btn') || e.target.closest('.download-btn')) return;
          openMediaModal(p);
        });
        item.querySelector('.download-btn').addEventListener('click', (e) => { e.stopPropagation(); downloadMedia(p); });
        item.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteMedia(p._id); });
        galleryGrid.appendChild(item);
      });
    } catch (err) { console.error('Gallery load error:', err); }
  }

  async function deleteMedia(id) {
    if (!confirm('Delete this moment?')) return;
    try {
      const res = await fetch(api('media/' + encodeURIComponent(id)), { method: 'DELETE' });
      if (res.ok) {
        vibrate(50);
        momentsCaptured = Math.max(0, momentsCaptured - 1);
        updateMomentsDisplay();
        loadGallery();
      }
    } catch (err) { showMicroToast('Delete failed'); }
  }

  function openMediaModal(p) {
    mediaModalBody.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'media-wrap';
    if (p.fileType === 'video') {
      const v = document.createElement('video');
      v.src = url('uploads/' + p.filename); v.controls = true; v.autoplay = true;
      wrap.appendChild(v);
      v.addEventListener('loadedmetadata', () => {
        if (v.videoWidth > v.videoHeight) wrap.classList.add('landscape-media');
      });
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + p.filename);
      img.decoding = 'async';
      img.addEventListener('load', () => {
        if (img.naturalWidth > img.naturalHeight) wrap.classList.add('landscape-media');
      });
      wrap.appendChild(img);
    }
    if (p.caption) {
      const capEl = document.createElement('div');
      capEl.className = 'snap-modal-caption snap-caption-bar';
      const yPos = p.captionYOffset != null ? p.captionYOffset : (p.captionPosition === 'top' ? 25 : 75);
      capEl.style.top = yPos + '%';
      capEl.innerHTML = `<span>${escapeHtml(p.caption)}</span>`;
      wrap.appendChild(capEl);
    }
    mediaModalBody.appendChild(wrap);
    const actions = document.createElement('div');
    actions.className = 'media-modal-actions';
    actions.innerHTML = `<button class="media-download-btn">Download</button>`;
    actions.querySelector('.media-download-btn').addEventListener('click', () => downloadMedia(p));
    mediaModalBody.appendChild(actions);
    mediaModal.classList.remove('hidden');
  }

  mediaModalClose.addEventListener('click', () => { mediaModal.classList.add('hidden'); mediaModalBody.innerHTML = ''; });
  mediaModal.addEventListener('click', (e) => {
    if (e.target === mediaModal) { mediaModal.classList.add('hidden'); mediaModalBody.innerHTML = ''; }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  checkSession();
})();
