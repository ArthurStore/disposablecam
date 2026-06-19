/**
 * Unified dynamic aspect ratio — landscape 16:9, portrait 9:16.
 * EXIF-aware via createImageBitmap({ imageOrientation: 'from-image' }).
 */
(function (global) {
  'use strict';

  const orientCache = new Map();
  const probeInflight = new Map();

  function applyOrient(orient, mediaEl, containerEl) {
    const landscape = orient === 'landscape';
    if (containerEl) {
      containerEl.classList.toggle('landscape', landscape);
      containerEl.classList.toggle('portrait', !landscape);
      containerEl.classList.toggle('landscape-media', landscape);
      containerEl.classList.toggle('landscape-item', landscape);
      containerEl.classList.toggle('preview-landscape', landscape);
      containerEl.classList.toggle('preview-portrait', !landscape);
    }
    if (mediaEl) {
      mediaEl.dataset.orient = orient;
      if (mediaEl.tagName === 'IMG') {
        mediaEl.style.imageOrientation = 'from-image';
      }
      mediaEl.style.objectFit = landscape ? 'contain' : 'cover';
    }
    return orient;
  }

  function isLandscapeMedia(el) {
    if (!el) return false;
    if (el.dataset.orient === 'landscape') return true;
    if (el.dataset.orient === 'portrait') return false;
    const w = el.naturalWidth || el.videoWidth || 0;
    const h = el.naturalHeight || el.videoHeight || 0;
    return w > 0 && h > 0 && w > h;
  }

  function applyMediaLayout(mediaEl, containerEl) {
    const orient = isLandscapeMedia(mediaEl) ? 'landscape' : 'portrait';
    return applyOrient(orient, mediaEl, containerEl);
  }

  async function probeImageSrc(src) {
    if (!src) return null;
    if (orientCache.has(src)) return orientCache.get(src);
    if (probeInflight.has(src)) return probeInflight.get(src);

    const task = (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) return null;
        const blob = await res.blob();
        if (typeof createImageBitmap === 'function') {
          const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
          const orient = bmp.width > bmp.height ? 'landscape' : 'portrait';
          bmp.close();
          orientCache.set(src, orient);
          return orient;
        }
      } catch (e) {
        /* fetch / bitmap probe failed — fall back to element dimensions */
      }
      return null;
    })();

    probeInflight.set(src, task);
    const result = await task;
    probeInflight.delete(src);
    return result;
  }

  function orientFromElement(mediaEl) {
    const w = mediaEl.naturalWidth || mediaEl.videoWidth || 0;
    const h = mediaEl.naturalHeight || mediaEl.videoHeight || 0;
    if (w > 0 && h > 0) return w > h ? 'landscape' : 'portrait';
    return null;
  }

  function bindMediaOrientation(mediaEl, containerEl, onReady) {
    let settled = false;
    const finish = (orient) => {
      if (settled) return;
      settled = true;
      applyOrient(orient, mediaEl, containerEl);
      if (onReady) onReady(orient, mediaEl, containerEl);
    };

    if (!mediaEl) {
      if (onReady) onReady('portrait', mediaEl, containerEl);
      return;
    }

    if (mediaEl.tagName === 'IMG') {
      mediaEl.style.imageOrientation = 'from-image';
      const src = mediaEl.currentSrc || mediaEl.src;

      const resolve = () => {
        if (settled) return;
        if (!src) {
          finish(orientFromElement(mediaEl) || 'portrait');
          return;
        }
        probeImageSrc(src).then((probed) => {
          if (settled) return;
          if (probed) finish(probed);
          else finish(orientFromElement(mediaEl) || 'portrait');
        });
      };

      if (mediaEl.complete && (mediaEl.naturalWidth || mediaEl.naturalHeight)) {
        resolve();
      } else {
        mediaEl.addEventListener('load', resolve, { once: true });
        mediaEl.addEventListener('error', () => finish('portrait'), { once: true });
        if (src) resolve();
      }
      return;
    }

    if (mediaEl.tagName === 'VIDEO') {
      const done = () => finish(orientFromElement(mediaEl) || 'portrait');
      mediaEl.addEventListener('loadedmetadata', done, { once: true });
      mediaEl.addEventListener('error', () => finish('portrait'), { once: true });
      if (mediaEl.videoWidth) done();
      return;
    }

    finish('portrait');
  }

  global.MediaOrientation = {
    isLandscapeMedia,
    applyMediaLayout,
    applyOrient,
    probeImageSrc,
    bindMediaOrientation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
