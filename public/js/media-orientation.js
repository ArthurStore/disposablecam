/**
 * Unified orientation detection — EXIF-aware for JPEG/HEIF.
 *
 * Problem: phones shoot landscape photos with an EXIF rotation tag.
 * The browser auto-rotates the *display*, but naturalWidth/naturalHeight
 * reflect the *raw* (pre-rotation) sensor dimensions, so a landscape photo
 * taken in landscape mode returns naturalWidth < naturalHeight → wrong.
 *
 * Fix: parse the EXIF Orientation tag ourselves from the raw bytes.
 * Tags 5-8 mean the image is rotated 90°/270° → swap width/height.
 */
(function (global) {
  'use strict';

  // Cache: src → 'landscape' | 'portrait'
  const orientCache = new Map();

  /* ─── EXIF orientation reader ─────────────────────────────────── */

  // Returns the EXIF Orientation value (1-8) or 1 if not found / not JPEG.
  function readExifOrientation(buffer) {
    const view = new DataView(buffer);
    // JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) return 1;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xFFE1) {
        // APP1 — check for Exif header
        const segLen = view.getUint16(offset);
        offset += 2;
        if (segLen < 6) return 1;
        // "Exif\0\0"
        if (view.getUint32(offset) !== 0x45786966) return 1; // 'Exif'
        if (view.getUint16(offset + 4) !== 0x0000) return 1;

        const tiffStart = offset + 6;
        const endian = view.getUint16(tiffStart);
        const little = endian === 0x4949; // 'II' = little-endian

        const get16 = (o) => view.getUint16(tiffStart + o, little);
        const get32 = (o) => view.getUint32(tiffStart + o, little);

        if (get16(2) !== 0x002A) return 1; // TIFF magic

        const ifdOffset = get32(4);
        const entries = get16(ifdOffset);

        for (let i = 0; i < entries; i++) {
          const entryOffset = ifdOffset + 2 + i * 12;
          if (entryOffset + 12 > view.byteLength - tiffStart) break;
          const tag = get16(entryOffset);
          if (tag === 0x0112) { // Orientation
            return get16(entryOffset + 8);
          }
        }
        return 1;
      } else if ((marker & 0xFF00) === 0xFF00) {
        const segLen = view.getUint16(offset);
        offset += segLen;
      } else {
        break;
      }
    }
    return 1;
  }

  // Returns true if the image needs width/height swapped (rotated 90°/270°)
  function exifNeedsSwap(orientation) {
    return orientation >= 5 && orientation <= 8;
  }

  /* ─── Probe: fetch first 64 KB, read EXIF, cache result ─────── */

  const probeInflight = new Map();

  async function probeImageSrc(src) {
    if (!src) return null;
    if (orientCache.has(src)) return orientCache.get(src);
    if (probeInflight.has(src)) return probeInflight.get(src);

    const task = (async () => {
      try {
        // Fetch only enough bytes to contain the EXIF APP1 segment (~64 KB is plenty)
        const res = await fetch(src, { headers: { Range: 'bytes=0-65535' }, cache: 'force-cache' });
        if (!res.ok && res.status !== 206) return null;
        const buffer = await res.arrayBuffer();

        // Try EXIF parsing first
        const exifOri = readExifOrientation(buffer);
        const needsSwap = exifNeedsSwap(exifOri);

        // Also try createImageBitmap for extra accuracy
        if (typeof createImageBitmap === 'function') {
          try {
            const blob = new Blob([buffer]);
            const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
            const orient = bmp.width > bmp.height ? 'landscape' : 'portrait';
            bmp.close();
            orientCache.set(src, orient);
            return orient;
          } catch (_) { /* fall through to EXIF result */ }
        }

        // Fall back to EXIF swap logic
        // We need dimensions — get them from the element after it loads
        return { needsSwap, exifOri };
      } catch (_) {
        return null;
      }
    })();

    probeInflight.set(src, task);
    const result = await task;
    probeInflight.delete(src);
    return result;
  }

  /* ─── Orientation from element (with EXIF correction) ─────────── */

  async function resolveOrient(mediaEl) {
    if (mediaEl.tagName === 'VIDEO') {
      const w = mediaEl.videoWidth || 0;
      const h = mediaEl.videoHeight || 0;
      return w > 0 && h > 0 && w > h ? 'landscape' : 'portrait';
    }

    // For images: probe EXIF first, then apply swap if needed
    const src = mediaEl.currentSrc || mediaEl.src;
    const probed = await probeImageSrc(src);

    if (typeof probed === 'string') return probed; // 'landscape' | 'portrait' from createImageBitmap

    // probed is { needsSwap, exifOri } or null
    const w = mediaEl.naturalWidth || 0;
    const h = mediaEl.naturalHeight || 0;

    if (!w || !h) return 'portrait';

    let effectiveW = w;
    let effectiveH = h;

    if (probed && probed.needsSwap) {
      effectiveW = h;
      effectiveH = w;
    }

    return effectiveW > effectiveH ? 'landscape' : 'portrait';
  }

  /* ─── Public API ───────────────────────────────────────────────── */

  function applyOrient(orient, mediaEl, containerEl) {
    const landscape = orient === 'landscape';
    if (containerEl) {
      containerEl.classList.toggle('landscape', landscape);
      containerEl.classList.toggle('portrait', !landscape);
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

  function bindMediaOrientation(mediaEl, containerEl, onReady) {
    let settled = false;

    const finish = (orient) => {
      if (settled) return;
      settled = true;
      applyOrient(orient, mediaEl, containerEl);
      if (onReady) onReady(orient, mediaEl, containerEl);
    };

    if (!mediaEl) {
      if (onReady) onReady('portrait', null, containerEl);
      return;
    }

    const doResolve = () => {
      if (settled) return;
      resolveOrient(mediaEl).then(finish);
    };

    if (mediaEl.tagName === 'IMG') {
      mediaEl.style.imageOrientation = 'from-image';

      if (mediaEl.complete && mediaEl.naturalWidth) {
        doResolve();
      } else {
        mediaEl.addEventListener('load', doResolve, { once: true });
        mediaEl.addEventListener('error', () => finish('portrait'), { once: true });
        // Also kick off probe early so result is cached when load fires
        const src = mediaEl.src;
        if (src) probeImageSrc(src).catch(() => {});
      }
      return;
    }

    if (mediaEl.tagName === 'VIDEO') {
      if (mediaEl.videoWidth) {
        doResolve();
      } else {
        mediaEl.addEventListener('loadedmetadata', doResolve, { once: true });
        mediaEl.addEventListener('error', () => finish('portrait'), { once: true });
      }
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
