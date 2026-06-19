/**
 * Unified dynamic aspect ratio — landscape 16:9, portrait 9:16.
 * Used by camera preview, /live, and /recap.
 */
(function (global) {
  'use strict';

  function isLandscapeMedia(el) {
    if (!el) return false;
    const w = el.naturalWidth || el.videoWidth || 0;
    const h = el.naturalHeight || el.videoHeight || 0;
    return w > 0 && h > 0 && w > h;
  }

  function applyMediaLayout(mediaEl, containerEl) {
    const landscape = isLandscapeMedia(mediaEl);
    if (containerEl) {
      containerEl.classList.toggle('landscape', landscape);
      containerEl.classList.toggle('portrait', !landscape);
      containerEl.classList.toggle('landscape-media', landscape);
      containerEl.classList.toggle('landscape-item', landscape);
      containerEl.classList.toggle('preview-landscape', landscape);
      containerEl.classList.toggle('preview-portrait', !landscape);
    }
    if (mediaEl) {
      mediaEl.style.objectFit = landscape ? 'contain' : 'cover';
    }
    return landscape ? 'landscape' : 'portrait';
  }

  function bindMediaOrientation(mediaEl, containerEl, onReady) {
    const done = () => {
      const orient = applyMediaLayout(mediaEl, containerEl);
      if (onReady) onReady(orient, mediaEl, containerEl);
    };
    if (!mediaEl) {
      if (onReady) onReady('portrait', mediaEl, containerEl);
      return;
    }
    if (mediaEl.tagName === 'VIDEO') {
      mediaEl.addEventListener('loadedmetadata', done, { once: true });
      mediaEl.addEventListener('error', () => onReady && onReady('portrait', mediaEl, containerEl), { once: true });
    } else if (mediaEl.complete && (mediaEl.naturalWidth || mediaEl.videoWidth)) {
      done();
    } else {
      mediaEl.addEventListener('load', done, { once: true });
      mediaEl.addEventListener('error', () => onReady && onReady('portrait', mediaEl, containerEl), { once: true });
    }
  }

  global.MediaOrientation = {
    isLandscapeMedia,
    applyMediaLayout,
    bindMediaOrientation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
