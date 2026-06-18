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
  const captureBtnLs = document.getElementById('capture-btn-ls');
  const rotateBtn = document.getElementById('rotate-btn');
  const rotateBtnLs = document.getElementById('rotate-btn-ls');
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
  const gridToggle = document.getElementById('grid-toggle');
  const continuousToggle = document.getElementById('continuous-toggle');
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
    if (!galleryThumb) return;
    const latest = photos && photos.find((p) => p.fileType === 'photo');
    if (latest) {
      galleryThumb.classList.add('has-photo');
      galleryThumb.style.backgroundImage = `url('${url('uploads/' + latest.filename)}')`;
    } else {
      galleryThumb.classList.remove('has-photo');
      galleryThumb.style.backgroundImage = '';
    }
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
    genderIcon.innerHTML = `<img src="${url('images/' + (isMale ? 'male' : 'female') + '-icon.svg')}" alt="">`;
    initCamera();
    setupZoomGestures();
    listenForRevocation();
    refreshGalleryThumb();
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

  gridToggle.addEventListener('click', () => {
    vibrate(15);
    gridEnabled = !gridEnabled;
    gridToggle.textContent = gridEnabled ? 'ON' : 'OFF';
    gridToggle.setAttribute('aria-pressed', String(gridEnabled));
    gridOverlay.classList.toggle('hidden', !gridEnabled);
  });

  continuousToggle.addEventListener('click', () => {
    vibrate(15);
    continuousMode = !continuousMode;
    continuousToggle.textContent = continuousMode ? 'ON' : 'OFF';
    continuousToggle.setAttribute('aria-pressed', String(continuousMode));
    if (continuousMode) showMicroToast('Continuous mode ON — photos queue to drafts');
    else showMicroToast('Continuous mode OFF');
  });

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
    if (captureBtnLs) captureBtnLs.classList.toggle('video-mode', currentMode === 'video' || currentMode === 'timelapse');
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
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());

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
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
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
    initCamera(false);
  });

  if (rotateBtnLs) {
    rotateBtnLs.addEventListener('click', () => {
      vibrate(30);
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      mirrorOverride = null;
      currentZoomPreset = 1;
      document.querySelectorAll('.zoom-preset-btn').forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.zoom) === 1));
      initCamera(false);
    });
  }

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
  if (captureBtnLs) captureBtnLs.addEventListener('click', handleCaptureTrigger);

  // Long-press for video
  captureBtn.addEventListener('touchstart', () => {
    if (currentMode !== 'photo') return;
    longPressTimer = setTimeout(() => {
      document.querySelectorAll('.mode-pill').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'video'));
      currentMode = 'video';
      captureBtn.classList.add('video-mode');
      if (captureBtnLs) captureBtnLs.classList.add('video-mode');
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
    vibrate(50);
    playShutterSound();

    if (flashMode === 'on' || flashMode === 'auto') {
      await applyFlash();
      if (flashMode === 'auto') {
        setTimeout(() => {
          flashMode = 'off'; flashBtn.dataset.mode = 'off';
          flashBtn.querySelector('.flash-off').classList.remove('hidden');
          flashBtn.querySelector('.flash-on').classList.add('hidden');
          applyFlash();
        }, 300);
      }
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (video.classList.contains('mirrored')) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      if (continuousMode) {
        addToDraftQueue(blob, 'photo.jpg', 'image/jpeg');
      } else {
        showReviewScreen(blob, 'photo.jpg', 'image/jpeg', false);
      }
    }, 'image/jpeg', 0.92);
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
    if (captureBtnLs) captureBtnLs.classList.add('recording');
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
    if (captureBtnLs) captureBtnLs.classList.remove('recording');
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
    if (captureBtnLs) captureBtnLs.classList.add('recording');
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
    if (captureBtnLs) captureBtnLs.classList.remove('recording');
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
      console.error('Timelapse render error:', e);
      showMicroToast('Timelapse render failed');
      tlFrames = [];
    }
  }

  function renderTimelapseVideo(frames, fps) {
    return new Promise((resolve, reject) => {
      const w = frames[0].width, h = frames[0].height;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = w; outCanvas.height = h;
      const ctx = outCanvas.getContext('2d');
      const stream = outCanvas.captureStream(fps);

      let rec;
      const mimeTypes = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          try { rec = new MediaRecorder(stream, { mimeType: mime }); break; } catch (e) {}
        }
      }
      if (!rec) {
        try { rec = new MediaRecorder(stream); } catch (e) { reject(e); return; }
      }

      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        if (chunks.length === 0) { reject(new Error('No data recorded')); return; }
        resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
      };
      rec.onerror = (e) => reject(e);

      // Request data frequently to prevent data loss
      rec.start(200);

      let i = 0;
      const frameDelay = Math.max(1000 / fps, 16);

      function drawNextFrame() {
        if (i >= frames.length) {
          // Flush any remaining data then stop
          try { rec.requestData(); } catch (e) {}
          setTimeout(() => {
            try { rec.stop(); } catch (e) { reject(e); }
          }, 200);
          return;
        }
        ctx.drawImage(frames[i], 0, 0);
        i++;
        setTimeout(drawNextFrame, frameDelay);
      }

      drawNextFrame();
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
      await uploadMedia(item.blob, item.filename, item.mimetype, item.caption, 'bottom');
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
    await uploadMedia(item.blob, item.filename, item.mimetype, item.caption, 'bottom');
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
    } else {
      const img = document.createElement('img');
      img.src = item.objUrl;
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
    } else {
      const img = document.createElement('img');
      img.src = objUrl;
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
    uploadMedia(blob, filename, mimetype, caption, 'bottom');
    pendingCapture = null;
  });

  // ─── Upload ───
  async function uploadMedia(blob, filename, mimetype, caption, capPos) {
    uploadProgress.classList.remove('hidden');
    progressFill.style.width = '30%';

    const formData = new FormData();
    formData.append('media', blob, filename);
    formData.append('participantNumber', currentUser.participantNumber);
    formData.append('fullName', currentUser.fullName);
    formData.append('gender', currentUser.gender);
    formData.append('caption', caption || '');
    formData.append('captionPosition', capPos || 'bottom');

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
        if (p.fileType === 'video') {
          item.innerHTML = `<video src="${url('uploads/' + p.filename)}" muted preload="metadata"></video><span class="video-badge">▶</span>`;
        } else {
          item.innerHTML = `<img src="${url('uploads/' + p.filename)}" alt="Photo" loading="lazy">`;
        }
        if (p.caption) {
          item.innerHTML += `<span class="item-caption">${escapeHtml(p.caption)}</span>`;
        }
        item.innerHTML += `<div class="item-actions"><button class="download-btn" title="Download">${DOWNLOAD_SVG}</button><button class="delete-btn" data-id="${p._id}" title="Delete">${TRASH_SVG}</button></div>`;
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
    wrap.style.position = 'relative';
    if (p.fileType === 'video') {
      const v = document.createElement('video');
      v.src = url('uploads/' + p.filename); v.controls = true; v.autoplay = true;
      wrap.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + p.filename);
      img.style.maxWidth = '92vw'; img.style.maxHeight = '75vh'; img.style.borderRadius = '14px';
      wrap.appendChild(img);
    }
    if (p.caption) {
      const capEl = document.createElement('div');
      capEl.className = 'modal-caption-overlay';
      capEl.innerHTML = `<span class="modal-caption-text">${escapeHtml(p.caption)}</span>`;
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
