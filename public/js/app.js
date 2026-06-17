/* ═══════════════════════════════════════
   Disposable Camera — Main App Logic
   (subdir-safe, relative paths only)
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  const BASE = (function () {
    const p = window.location.pathname;
    return p.endsWith('/') ? p : p.replace(/\/[^/]*$/, '/');
  })();
  const api = (rel) => BASE + 'api/' + rel.replace(/^\//, '');
  const url = (rel) => BASE + rel.replace(/^\//, '');

  let currentUser = null;
  let currentFacingMode = 'environment';
  let mediaStream = null;
  let isVideoMode = false;
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let longPressTimer = null;
  let mirrorOverride = null;
  let recStart = 0;
  let recTimerId = null;
  let flashMode = 'off'; // off | on | auto
  let zoomLevel = 1;
  let lastTapTime = 0;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pendingCapture = null; // { blob, filename, mimetype, isVideo }
  let captionPosition = 'bottom';

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
  const zoomLayer = document.getElementById('zoom-layer');
  const canvas = document.getElementById('capture-canvas');
  const captureBtn = document.getElementById('capture-btn');
  const rotateBtn = document.getElementById('rotate-btn');
  const flashBtn = document.getElementById('flash-btn');
  const modeToggleBtn = document.getElementById('mode-toggle-btn');
  const recordingIndicator = document.getElementById('recording-indicator');
  const recTimer = document.getElementById('rec-timer');
  const zoomIndicator = document.getElementById('zoom-indicator');
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
  const reviewCaptionBar = document.getElementById('review-caption-bar');
  const reviewCaptionText = document.getElementById('review-caption-text');
  const captionPosTop = document.getElementById('caption-pos-top');
  const captionPosBottom = document.getElementById('caption-pos-bottom');
  const reviewDiscardBtn = document.getElementById('review-discard-btn');
  const reviewUploadBtn = document.getElementById('review-upload-btn');
  const microToast = document.getElementById('micro-toast');

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    return audioCtx;
  }

  // Classic mechanical shutter — dual-click with noise burst
  function playShutterSound() {
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;

      function click(at, freq, dur, vol) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 2;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, at);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.3, at + dur);
        gain.gain.setValueAtTime(vol, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + dur);
      }

      // Shutter blade snap (two rapid clicks)
      click(t, 2800, 0.04, 0.35);
      click(t + 0.045, 1800, 0.06, 0.28);
      // Spring/mirror return
      click(t + 0.12, 900, 0.08, 0.12);

      // White noise burst for mechanical texture
      const bufSize = ctx.sampleRate * 0.05;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      noise.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
    } catch (e) {}
  }

  function playBeepSound() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
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
      if (res.ok) updateGalleryThumbnail(await res.json());
    } catch (e) {}
  }

  window.fetchUserGallery = async function () {
    if (!currentUser) return [];
    const res = await fetch(api('gallery/' + encodeURIComponent(currentUser.participantNumber)));
    if (!res.ok) throw new Error('Gallery unavailable');
    return res.json();
  };

  function downloadMedia(p) {
    const a = document.createElement('a');
    a.href = url('uploads/' + p.filename);
    a.download = p.originalName || p.filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ═══ Registration ═══
  function checkSession() {
    loadEventConfig();
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
        setTimeout(() => {
          localStorage.removeItem('dc_user');
          location.reload();
        }, 2000);
      }
    });
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
      applyFlash();
      resetZoom();
    } catch (err) {
      console.error('Camera error:', err);
      alert('Unable to access camera. Please grant permission and try again.');
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
    try {
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    } catch (e) { /* torch not supported */ }
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
    initCamera();
  });

  modeToggleBtn.addEventListener('click', () => {
    vibrate(30);
    isVideoMode = !isVideoMode;
    modeToggleBtn.classList.toggle('active', isVideoMode);
    modeToggleBtn.setAttribute('aria-pressed', String(isVideoMode));
    captureBtn.classList.toggle('video-mode', isVideoMode);
    if (!isVideoMode && isRecording) stopRecording();
    initCamera();
  });

  // ═══ Zoom ═══
  function setZoom(level) {
    zoomLevel = Math.min(Math.max(level, 1), 4);
    zoomLayer.style.transform = `scale(${zoomLevel})`;
    zoomIndicator.textContent = zoomLevel === 1 ? '1×' : zoomLevel.toFixed(1) + '×';
  }

  function resetZoom() {
    setZoom(1);
  }

  zoomIndicator.addEventListener('click', () => {
    vibrate(15);
    resetZoom();
  });

  function setupZoomGestures() {
    viewfinder.addEventListener('touchstart', onTouchStart, { passive: false });
    viewfinder.addEventListener('touchmove', onTouchMove, { passive: false });
    viewfinder.addEventListener('touchend', onTouchEnd);

    viewfinder.addEventListener('dblclick', (e) => {
      e.preventDefault();
      vibrate(20);
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
      } else {
        lastTapTime = now;
      }
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDist(e.touches);
      const scale = dist / pinchStartDist;
      setZoom(pinchStartZoom * scale);
    }
  }

  function onTouchEnd() {
    pinchStartDist = 0;
  }

  // ═══ Capture ═══
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
      modeToggleBtn.classList.add('active');
      modeToggleBtn.setAttribute('aria-pressed', 'true');
      captureBtn.classList.add('video-mode');
      initCamera().then(() => startRecording());
    }, 800);
  }, { passive: true });

  captureBtn.addEventListener('touchend', () => clearTimeout(longPressTimer));
  captureBtn.addEventListener('touchcancel', () => clearTimeout(longPressTimer));

  async function takePhoto() {
    vibrate(50);
    playShutterSound();

    if (flashMode === 'on' || flashMode === 'auto') {
      await applyFlash();
      if (flashMode === 'auto') {
        setTimeout(() => {
          flashMode = 'off';
          flashBtn.dataset.mode = 'off';
          flashBtn.querySelector('.flash-off').classList.remove('hidden');
          flashBtn.querySelector('.flash-on').classList.add('hidden');
          applyFlash();
        }, 300);
      }
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (video.classList.contains('mirrored')) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) showReviewScreen(blob, 'photo.jpg', 'image/jpeg', false);
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
      recordedChunks = [];
      showReviewScreen(blob, 'video.webm', blob.type, true);
    };

    mediaRecorder.start(100);
    isRecording = true;
    captureBtn.classList.add('recording');
    recordingIndicator.classList.remove('hidden');
    recStart = Date.now();
    recTimer.textContent = '00:00';
    recTimerId = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      recTimer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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

  // ═══ Review Screen ═══
  function showReviewScreen(blob, filename, mimetype, isVideo) {
    pendingCapture = { blob, filename, mimetype, isVideo };
    captionPosition = 'bottom';
    reviewCaptionInput.value = '';
    reviewCaptionText.textContent = '';
    reviewCaptionBar.className = 'review-caption-bar bottom';
    captionPosTop.classList.remove('active');
    captionPosBottom.classList.add('active');

    reviewMedia.innerHTML = '';
    const objUrl = URL.createObjectURL(blob);
    if (isVideo) {
      const v = document.createElement('video');
      v.src = objUrl;
      v.controls = true;
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      reviewMedia.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = objUrl;
      reviewMedia.appendChild(img);
    }

    reviewScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
  }

  reviewCaptionInput.addEventListener('input', () => {
    reviewCaptionText.textContent = reviewCaptionInput.value.trim();
  });

  captionPosTop.addEventListener('click', () => {
    captionPosition = 'top';
    reviewCaptionBar.className = 'review-caption-bar top';
    captionPosTop.classList.add('active');
    captionPosBottom.classList.remove('active');
  });

  captionPosBottom.addEventListener('click', () => {
    captionPosition = 'bottom';
    reviewCaptionBar.className = 'review-caption-bar bottom';
    captionPosBottom.classList.add('active');
    captionPosTop.classList.remove('active');
  });

  reviewDiscardBtn.addEventListener('click', () => {
    pendingCapture = null;
    reviewMedia.innerHTML = '';
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
    uploadMedia(blob, filename, mimetype, caption, captionPosition);
    pendingCapture = null;
  });

  // ═══ Upload ═══
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
    const timeoutMs = isVideo ? 120000 : 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      progressFill.style.width = '60%';
      const res = await fetch(api('upload'), {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      progressFill.style.width = '90%';
      const data = await res.json();

      if (res.ok) {
        vibrate([50, 30, 50]);
        progressFill.style.width = '100%';
        refreshGalleryThumb();
        setTimeout(() => {
          uploadProgress.classList.add('hidden');
          progressFill.style.width = '0';
        }, 800);
      } else {
        showMicroToast(data.error || (isVideo ? 'Video upload failed, please check your network connection' : 'Upload failed'));
        uploadProgress.classList.add('hidden');
        progressFill.style.width = '0';
      }
    } catch (err) {
      clearTimeout(timeoutId);
      showMicroToast(isVideo ? 'Video upload failed, please check your network connection' : 'Upload failed — check your connection');
      uploadProgress.classList.add('hidden');
      progressFill.style.width = '0';
    }
  }

  // ═══ Gallery Modal ═══
  const TRASH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  const DOWNLOAD_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  galleryBtn.addEventListener('click', () => {
    vibrate(20);
    loadGallery();
    galleryModal.classList.remove('hidden');
  });

  galleryModalClose.addEventListener('click', () => {
    galleryModal.classList.add('hidden');
  });

  galleryModal.addEventListener('click', (e) => {
    if (e.target === galleryModal) galleryModal.classList.add('hidden');
  });

  async function loadGallery() {
    if (!currentUser) return;
    try {
      const res = await fetch(api('gallery/' + encodeURIComponent(currentUser.participantNumber)));
      const photos = await res.json();
      galleryGrid.innerHTML = '';

      if (!photos.length) {
        galleryEmpty.classList.remove('hidden');
        updateGalleryThumbnail([]);
        return;
      }
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

        item.querySelector('.download-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          downloadMedia(p);
        });

        item.querySelector('.delete-btn').addEventListener('click', (e) => {
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
    } catch (err) { showMicroToast('Delete failed'); }
  }

  function openMediaModal(p) {
    mediaModalBody.innerHTML = '';
    if (p.fileType === 'video') {
      const v = document.createElement('video');
      v.src = url('uploads/' + p.filename);
      v.controls = true;
      v.autoplay = true;
      mediaModalBody.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url('uploads/' + p.filename);
      mediaModalBody.appendChild(img);
    }
    const actions = document.createElement('div');
    actions.className = 'media-modal-actions';
    actions.innerHTML = `<button class="media-download-btn">Download</button>`;
    actions.querySelector('.media-download-btn').addEventListener('click', () => downloadMedia(p));
    mediaModalBody.appendChild(actions);
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  checkSession();
})();
