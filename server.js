require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const osu = require('os-utils');
const connectDB = require('./config/db');
const User = require('./models/User');
const Photo = require('./models/Photo');
const Message = require('./models/Message');
const PrivateMessage = require('./models/PrivateMessage');
const EventSettings = require('./models/EventSettings');
const AdminPin = require('./models/AdminPin');
const bcrypt = require('bcryptjs');

// ═══ Sub-path mounting (e.g. BASE_PATH=/cam) ═══
// All static files, API routes, page routes, and Socket.IO will be
// mounted under BASE_PATH. The client uses relative URLs and computes
// the Socket.IO path from window.location, so any base works.
let BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
if (BASE_PATH && !BASE_PATH.startsWith('/')) BASE_PATH = '/' + BASE_PATH;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: (BASE_PATH || '') + '/socket.io',
  maxHttpBufferSize: 50 * 1024 * 1024
});

connectDB();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sub-router holds every app route; mounted at BASE_PATH (or '/')
const router = express.Router();

router.use(express.static(path.join(__dirname, 'public')));
router.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const mime = (file.mimetype || '').toLowerCase();
    const extFromName = path.extname(file.originalname || '').toLowerCase();
    const ext = extFromName || (mime.startsWith('video') ? '.webm' : '.jpg');
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const ALLOWED_VIDEO_EXTS = new Set(['.webm', '.mp4', '.mov', '.mkv', '.avi', '.3gp', '.m4v']);
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp']);

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.UPLOAD_MAX_SIZE) || 100) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    // Accept by MIME prefix, octet-stream (raw blobs from MediaRecorder), or known extension
    if (mime.startsWith('image/') || mime.startsWith('video/') ||
        mime === 'application/octet-stream' ||
        ALLOWED_VIDEO_EXTS.has(ext) || ALLOWED_IMAGE_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

function handleUpload(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message;
        return res.status(400).json({ error: msg });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  };
}

async function getEventSettings() {
  let settings = await EventSettings.findOne();
  if (!settings) {
    settings = await EventSettings.create({});
  }
  return settings;
}

// ─── Initialize admin PIN ───
async function initAdminPin() {
  const count = await AdminPin.countDocuments();
  if (count === 0) {
    const pin = process.env.ADMIN_PIN || '1234';
    await AdminPin.create({ pin });
    console.log('Admin PIN initialized');
  }
}
initAdminPin();
initEventSettings();

async function initEventSettings() {
  const count = await EventSettings.countDocuments();
  if (count === 0) {
    await EventSettings.create({});
    console.log('Event settings initialized');
  }
}

// ═══════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════

router.post('/api/validate', async (req, res) => {
  try {
    const { participantNumber } = req.body;
    const user = await User.findOne({ participantNumber: participantNumber.trim() });
    if (!user) return res.status(404).json({ error: 'Participant not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Your account has been suspended' });
    res.json({
      id: user._id,
      participantNumber: user.participantNumber,
      fullName: user.fullName,
      gender: user.gender
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/upload', handleUpload('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { participantNumber, fullName, gender, caption, captionPosition, captionYOffset } = req.body;
    const user = await User.findOne({ participantNumber });
    if (!user) return res.status(404).json({ error: 'Participant not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Your account has been suspended' });

    const fileType = (req.file.mimetype && req.file.mimetype.startsWith('video')) ||
      /\.(webm|mp4|mov|mkv)$/i.test(req.file.filename) ? 'video' : 'photo';

    const photo = await Photo.create({
      participantNumber,
      fullName: fullName || user.fullName,
      gender: gender || user.gender,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      fileType,
      caption: caption || '',
      captionPosition: captionPosition === 'top' ? 'top' : 'bottom',
      captionYOffset: Math.min(97, Math.max(3, parseFloat(captionYOffset) || 50)),
      fileSize: req.file.size
    });

    io.emit('new-upload', {
      _id: photo._id,
      participantNumber: photo.participantNumber,
      fullName: photo.fullName,
      gender: photo.gender,
      filename: photo.filename,
      fileType: photo.fileType,
      caption: photo.caption,
      captionPosition: photo.captionPosition,
      captionYOffset: photo.captionYOffset,
      uploadedAt: photo.uploadedAt
    });

    res.json({ success: true, photo });
  } catch (err) {
    console.error('[UPLOAD FAILED LOG]: ', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/api/gallery/:participantNumber', async (req, res) => {
  try {
    const photos = await Photo.find({ participantNumber: req.params.participantNumber })
      .sort({ uploadedAt: -1 });
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

router.delete('/api/media/:id', async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Media not found' });
    const filePath = path.join(__dirname, 'uploads', photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await Photo.findByIdAndDelete(req.params.id);
    io.emit('media-deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

router.get('/api/all-uploads', async (req, res) => {
  try {
    const photos = await Photo.find().sort({ uploadedAt: -1 });
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

// ─── Admin ───
router.post('/api/admin/login', async (req, res) => {
  try {
    const { pin } = req.body;
    const adminPin = await AdminPin.findOne();
    if (!adminPin) return res.status(500).json({ error: 'Admin PIN not configured' });
    const isMatch = await adminPin.comparePin(pin);
    if (!isMatch) return res.status(401).json({ error: 'Invalid PIN' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/api/admin/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalUploads = await Photo.countDocuments();
    const totalPhotos = await Photo.countDocuments({ fileType: 'photo' });
    const totalVideos = await Photo.countDocuments({ fileType: 'video' });
    const totalMessages = await Message.countDocuments();
    res.json({ totalUsers, totalUploads, totalPhotos, totalVideos, totalMessages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find().sort({ participantNumber: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/api/admin/users', async (req, res) => {
  try {
    const { participantNumber, fullName, gender } = req.body;
    const existing = await User.findOne({ participantNumber });
    if (existing) return res.status(409).json({ error: 'Participant number already exists' });
    const user = await User.create({ participantNumber, fullName, gender });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add user' });
  }
});

router.patch('/api/admin/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isBanned = !user.isBanned;
    await user.save();
    if (user.isBanned) {
      io.emit('participant-revoked', { participantNumber: user.participantNumber, reason: 'banned' });
    }
    res.json({ success: true, isBanned: user.isBanned });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle ban' });
  }
});

router.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const participantNumber = user.participantNumber;
    await User.findByIdAndDelete(req.params.id);
    io.emit('participant-revoked', { participantNumber, reason: 'deleted' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete participant' });
  }
});

router.get('/api/admin/system', async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    osu.cpuUsage((cpuPercent) => {
      let diskInfo = { total: 0, free: 0, used: 0 };
      try {
        const stats = fs.statfsSync('/');
        diskInfo.total = stats.bsize * stats.blocks;
        diskInfo.free = stats.bsize * stats.bfree;
        diskInfo.used = diskInfo.total - diskInfo.free;
      } catch (e) {}
      res.json({
        cpu: Math.round(cpuPercent * 100),
        memory: { total: totalMem, used: usedMem, free: freeMem, percent: Math.round((usedMem / totalMem) * 100) },
        disk: { total: diskInfo.total, used: diskInfo.used, free: diskInfo.free, percent: diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0 },
        uptime: os.uptime(), platform: os.platform(), hostname: os.hostname()
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch system info' });
  }
});

// Markdown table parser for participant imports
function parseMarkdownTable(data) {
  const rawLines = data.split('\n');
  const cleanedLines = [];

  for (const rawLine of rawLines) {
    let line = rawLine.trim();

    // Skip empty lines
    if (!line) continue;

    // Skip markdown separator lines (e.g., |---|---|---|)
    if (/^\|?[\s-|]+\|?$/.test(line)) continue;

    // Skip header-like lines that contain column titles
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('no peserta') || lowerLine.includes('nama') ||
        lowerLine.includes('l/p') || lowerLine.includes('gender') ||
        lowerLine.includes('number') || lowerLine.includes('name') ||
        /^[\|\s]*(no|nama|gender|l\/p)[\|\s]*/i.test(line)) {
      continue;
    }

    cleanedLines.push(line);
  }

  const participants = [];

  for (const line of cleanedLines) {
    // Remove leading/trailing pipes if present
    let stripped = line.replace(/^\|+|\|+$/g, '');

    // Split by pipe delimiter
    const parts = stripped.split('|').map(p => p.trim()).filter(Boolean);

    if (parts.length < 3) {
      // Try comma fallback for non-markdown format
      const commaParts = line.split(',').map(p => p.trim()).filter(Boolean);
      if (commaParts.length >= 3) {
        const [num, name, gender] = commaParts;
        participants.push({ num, name, gender });
      }
      continue;
    }

    const [num, name, gender] = parts;
    participants.push({ num, name, gender });
  }

  return participants;
}

router.post('/api/admin/import-participants', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });

    const participants = parseMarkdownTable(data);
    let imported = 0, skipped = 0;

    for (const { num, name, gender } of participants) {
      // Skip header remnants or invalid entries
      const numClean = (num || '').toString().trim();
      const nameClean = (name || '').toString().trim();
      const genderClean = (gender || '').toString().trim().toUpperCase();

      if (!numClean || numClean === '---' || /^[\s-]+$/.test(numClean)) continue;
      if (!nameClean || nameClean === '---' || /^[\s-]+$/.test(nameClean)) continue;

      let g = null;
      if (genderClean === 'L' || genderClean === 'LAKI - LAKI' || genderClean === 'LAKI-LAKI' || genderClean === 'LAKI') {
        g = 'Laki - Laki';
      } else if (genderClean === 'P' || genderClean === 'PEREMPUAN') {
        g = 'Perempuan';
      }
      if (!g) {
        skipped++;
        continue;
      }

      try {
        const existing = await User.findOne({ participantNumber: numClean });
        if (existing) {
          skipped++;
          continue;
        }
        await User.create({ participantNumber: numClean, fullName: nameClean, gender: g });
        imported++;
      } catch (e) {
        skipped++;
      }
    }

    res.json({ success: true, imported, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Import failed' });
  }
});

router.post('/api/admin/reset-event', async (req, res) => {
  try {
    // Delete all uploaded files
    const photos = await Photo.find({}, 'filename');
    for (const p of photos) {
      const fp = path.join(__dirname, 'uploads', p.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await Photo.deleteMany({});
    await Message.deleteMany({});
    await PrivateMessage.deleteMany({});
    io.emit('event-reset');
    res.json({ success: true });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

router.get('/api/event-config', async (req, res) => {
  try {
    const settings = await getEventSettings();
    res.json({
      eventName: settings.eventName,
      eventSubtitle: settings.eventSubtitle,
      coverImage: settings.coverImage,
      recapSlug: settings.recapSlug
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event config' });
  }
});

router.get('/api/admin/event-config', async (req, res) => {
  try {
    const settings = await getEventSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event config' });
  }
});

router.put('/api/admin/event-config', async (req, res) => {
  try {
    const { eventName, eventSubtitle, recapSlug, eventStartDate, eventEndDate, eventDays } = req.body;
    const settings = await getEventSettings();
    if (eventName !== undefined) settings.eventName = eventName.trim();
    if (eventSubtitle !== undefined) settings.eventSubtitle = eventSubtitle.trim();
    if (recapSlug !== undefined) {
      const slug = recapSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      const existing = await EventSettings.findOne({ recapSlug: slug, _id: { $ne: settings._id } });
      if (existing) return res.status(409).json({ error: 'Recap slug already in use' });
      settings.recapSlug = slug || 'moments';
    }
    if (eventStartDate) settings.eventStartDate = new Date(eventStartDate);
    if (eventEndDate) settings.eventEndDate = new Date(eventEndDate);
    if (eventDays !== undefined) settings.eventDays = Math.max(1, parseInt(eventDays) || 1);
    await settings.save();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update event config' });
  }
});

router.post('/api/admin/event-cover', handleUpload('cover'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No cover image uploaded' });
    const settings = await getEventSettings();
    if (settings.coverImage) {
      const oldPath = path.join(__dirname, 'uploads', settings.coverImage);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    settings.coverImage = req.file.filename;
    await settings.save();
    res.json({ success: true, coverImage: settings.coverImage });
  } catch (err) {
    res.status(500).json({ error: 'Cover upload failed' });
  }
});

router.get('/api/recap', async (req, res) => {
  try {
    const { participant, slug } = req.query;
    const settings = await getEventSettings();
    if (slug && slug !== settings.recapSlug) {
      return res.status(404).json({ error: 'Recap album not found' });
    }
    const query = participant ? { participantNumber: participant } : {};
    const photos = await Photo.find(query).sort({ uploadedAt: -1 });
    const totalPeople = await User.countDocuments({ isBanned: { $ne: true } });
    const uniqueUploaders = await Photo.distinct('participantNumber');
    const days = settings.eventDays || Math.max(1, Math.ceil(
      (new Date(settings.eventEndDate) - new Date(settings.eventStartDate)) / 86400000
    ) + 1);
    res.json({
      photos,
      participants: uniqueUploaders,
      stats: {
        moments: photos.length,
        days,
        people: Math.max(totalPeople, uniqueUploaders.length)
      },
      event: {
        eventName: settings.eventName,
        eventSubtitle: settings.eventSubtitle,
        coverImage: settings.coverImage,
        recapSlug: settings.recapSlug
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recap' });
  }
});

router.get('/api/participants', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const users = await User.find({ isBanned: { $ne: true } }, 'participantNumber fullName')
      .sort({ fullName: 1, participantNumber: 1 })
      .lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

router.get('/api/messages', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const messages = await Message.find().sort({ sentAt: -1 }).limit(100);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.get('/api/admin/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ sentAt: -1 }).limit(200);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.get('/api/admin/private-messages', async (req, res) => {
  try {
    const messages = await PrivateMessage.find().sort({ sentAt: -1 }).limit(300);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch private messages' });
  }
});

router.get('/api/private-messages/:participantNumber', async (req, res) => {
  try {
    const num = req.params.participantNumber;
    const messages = await PrivateMessage.find({
      $or: [
        { fromParticipantNumber: num },
        { toParticipantNumber: num }
      ]
    }).sort({ sentAt: 1 }).limit(200);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch private messages' });
  }
});

router.post('/api/chat/upload', handleUpload('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileType = (req.file.mimetype && req.file.mimetype.startsWith('video')) ||
      /\.(webm|mp4|mov)$/i.test(req.file.filename) ? 'video' : 'image';
    res.json({ success: true, filename: req.file.filename, mediaType: fileType });
  } catch (err) {
    console.error('Chat upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.post('/api/chat/share-gallery', async (req, res) => {
  try {
    const { photoId, participantNumber } = req.body;
    const photo = await Photo.findById(photoId);
    if (!photo) return res.status(404).json({ error: 'Media not found' });
    if (photo.participantNumber !== participantNumber) {
      return res.status(403).json({ error: 'Not your media' });
    }
    res.json({
      success: true,
      filename: photo.filename,
      mediaType: photo.fileType === 'video' ? 'video' : 'image'
    });
  } catch (err) {
    res.status(500).json({ error: 'Share failed' });
  }
});

// ─── Pages ───
router.get('/admin',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
router.get('/live',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'live-preview.html')));
router.get('/recap',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'recap.html')));
router.get('/recap/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'recap.html')));
router.get('/',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Mount the router. If BASE_PATH is set (e.g. /cam), all routes live under it.
app.use(BASE_PATH || '/', router);

// If running under a base path, redirect bare "/" → BASE_PATH/ for convenience.
if (BASE_PATH) {
  app.get('/', (req, res) => res.redirect(BASE_PATH + '/'));
}

// ═══ Socket.IO ═══
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-admin', () => {
    socket.join('admin');
  });

  socket.on('chat-message', async (data) => {
    try {
      if (!data.text && !data.mediaFilename) return;
      const msg = await Message.create({
        participantNumber: data.participantNumber,
        fullName: data.fullName,
        text: data.text || '',
        mediaFilename: data.mediaFilename || '',
        mediaType: data.mediaType || ''
      });
      const payload = {
        _id: msg._id,
        participantNumber: msg.participantNumber,
        fullName: msg.fullName,
        text: msg.text,
        mediaFilename: msg.mediaFilename,
        mediaType: msg.mediaType,
        sentAt: msg.sentAt
      };
      io.emit('chat-message', payload);
    } catch (err) {
      console.error('Chat message error:', err);
    }
  });

  socket.on('private-message', async (data) => {
    try {
      if (!data.text && !data.mediaFilename) return;
      const msg = await PrivateMessage.create({
        fromParticipantNumber: data.fromParticipantNumber,
        fromFullName: data.fromFullName,
        toParticipantNumber: data.toParticipantNumber,
        toFullName: data.toFullName,
        text: data.text || '',
        mediaFilename: data.mediaFilename || '',
        mediaType: data.mediaType || ''
      });
      const payload = {
        _id: msg._id,
        fromParticipantNumber: msg.fromParticipantNumber,
        fromFullName: msg.fromFullName,
        toParticipantNumber: msg.toParticipantNumber,
        toFullName: msg.toFullName,
        text: msg.text,
        mediaFilename: msg.mediaFilename,
        mediaType: msg.mediaType,
        sentAt: msg.sentAt
      };
      io.emit('private-message', payload);
    } catch (err) {
      console.error('Private message error:', err);
    }
  });

  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.timeout = 120000;
server.keepAliveTimeout = 120000;
server.listen(PORT, '0.0.0.0', () => {
  const base = BASE_PATH || '';
  console.log(`\n🎞️  Disposable Camera server running on port ${PORT}`);
  console.log(`📱 Mobile App:    http://localhost:${PORT}${base}/`);
  console.log(`🖥️  Live Preview: http://localhost:${PORT}${base}/live`);
  console.log(`🔐 Admin Panel:   http://localhost:${PORT}${base}/admin`);
  console.log(`📸 Recap Album:   http://localhost:${PORT}${base}/recap\n`);
});
