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
const AdminPin = require('./models/AdminPin');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 50 * 1024 * 1024
});

connectDB();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || (file.mimetype.startsWith('video') ? '.webm' : '.jpg');
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.UPLOAD_MAX_SIZE) || 50) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

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

// ═══════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════

// Validate participant
app.post('/api/validate', async (req, res) => {
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

// Upload media
app.post('/api/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { participantNumber, fullName, gender, caption } = req.body;

    const user = await User.findOne({ participantNumber });
    if (!user) return res.status(404).json({ error: 'Participant not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Your account has been suspended' });

    const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'photo';

    const photo = await Photo.create({
      participantNumber,
      fullName: fullName || user.fullName,
      gender: gender || user.gender,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      fileType,
      caption: caption || '',
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
      uploadedAt: photo.uploadedAt
    });

    res.json({ success: true, photo });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get personal gallery
app.get('/api/gallery/:participantNumber', async (req, res) => {
  try {
    const photos = await Photo.find({ participantNumber: req.params.participantNumber })
      .sort({ uploadedAt: -1 });
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

// Delete media
app.delete('/api/media/:id', async (req, res) => {
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

// Get all uploads (for live preview / recap)
app.get('/api/all-uploads', async (req, res) => {
  try {
    const photos = await Photo.find().sort({ uploadedAt: -1 });
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

// ─── Admin routes ───

app.post('/api/admin/login', async (req, res) => {
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

app.get('/api/admin/stats', async (req, res) => {
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

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find().sort({ participantNumber: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', async (req, res) => {
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

app.patch('/api/admin/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isBanned = !user.isBanned;
    await user.save();

    res.json({ success: true, isBanned: user.isBanned });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle ban' });
  }
});

app.get('/api/admin/system', async (req, res) => {
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
      } catch (e) {
        // statfsSync not available on all platforms
      }

      res.json({
        cpu: Math.round(cpuPercent * 100),
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          percent: Math.round((usedMem / totalMem) * 100)
        },
        disk: {
          total: diskInfo.total,
          used: diskInfo.used,
          free: diskInfo.free,
          percent: diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0
        },
        uptime: os.uptime(),
        platform: os.platform(),
        hostname: os.hostname()
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch system info' });
  }
});

// Import participants from markdown
app.post('/api/admin/import-participants', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });

    const lines = data.split('\n').filter(l => l.trim());
    let imported = 0;
    let skipped = 0;

    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) continue;

      const [num, name, gender] = parts;
      if (num.toLowerCase() === 'no' || num.toLowerCase() === 'no peserta' || num === '---') continue;

      const g = gender.toUpperCase() === 'L' || gender.toUpperCase() === 'P' ? gender.toUpperCase() : null;
      if (!g) continue;

      try {
        const existing = await User.findOne({ participantNumber: num });
        if (existing) { skipped++; continue; }
        await User.create({ participantNumber: num, fullName: name, gender: g });
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

// Recap album (public)
app.get('/api/recap', async (req, res) => {
  try {
    const { participant } = req.query;
    const query = participant ? { participantNumber: participant } : {};
    const photos = await Photo.find(query).sort({ uploadedAt: -1 });
    const participants = await Photo.distinct('participantNumber');
    res.json({ photos, participants });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recap' });
  }
});

// Get participant list for filter
app.get('/api/participants', async (req, res) => {
  try {
    const users = await User.find({}, 'participantNumber fullName').sort({ participantNumber: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// Chat history
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ sentAt: -1 }).limit(100);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ═══════════════════════════════════════
//  SOCKET.IO
// ═══════════════════════════════════════

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('chat-message', async (data) => {
    try {
      const msg = await Message.create({
        participantNumber: data.participantNumber,
        fullName: data.fullName,
        text: data.text
      });
      io.emit('chat-message', {
        _id: msg._id,
        participantNumber: msg.participantNumber,
        fullName: msg.fullName,
        text: msg.text,
        sentAt: msg.sentAt
      });
    } catch (err) {
      console.error('Chat message error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ─── Serve pages ───
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/live', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'live-preview.html'));
});

app.get('/recap', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'recap.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start server ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎞️  Disposable Camera server running on port ${PORT}`);
  console.log(`📱 Mobile App: http://localhost:${PORT}`);
  console.log(`🖥️  Live Preview: http://localhost:${PORT}/live`);
  console.log(`🔐 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`📸 Recap Album: http://localhost:${PORT}/recap\n`);
});
