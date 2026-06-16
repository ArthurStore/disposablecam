# 📷 Disposable Web Camera & Live Moments

A Progressive Web App (PWA) for retreat events — capture photos & videos with a disposable camera aesthetic, share moments in real-time on a projector, and chat live with participants.

## Features

- **Mobile-First PWA** — Installable on Android & iOS, works offline for shell assets
- **Disposable Camera UI** — Dark-mode aesthetic with flash/shutter animations, haptic feedback, and audio effects
- **Photo & Video Capture** — Front/back camera toggle, mirroring, optional Snapchat-style captions
- **Personal Gallery** — Each participant sees only their uploads, with delete capability
- **Live Preview (Projector)** — Cinematic 3-panel slideshow for desktop/projector display with real-time Socket.io updates
- **Real-Time Chat** — Socket.io powered live chat between participants
- **Admin Dashboard** — PIN-protected panel with participant management, import, ban/block, VPS resource monitoring
- **Full Album Recap** — Public gallery with per-participant filtering
- **Desktop Auto-Redirect** — Desktop browsers auto-redirect to projector view

## Tech Stack

- **Backend:** Node.js, Express.js, Socket.io, Multer, Mongoose
- **Database:** MongoDB (local)
- **Frontend:** Vanilla JS, CSS3 (no frameworks needed)

## Quick Start (Development)

```bash
# 1. Clone
git clone https://github.com/ArthurStore/disposablecam.git
cd disposablecam

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your MongoDB URI and admin PIN

# 4. Start MongoDB (if not running)
sudo systemctl start mongod

# 5. Run the server
npm run dev
```

Open `http://localhost:3000` on your phone (mobile view) or desktop (auto-redirects to live preview).

## Deployment on VPS (Production with PM2)

```bash
# 1. Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Install MongoDB
# Follow: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/
sudo systemctl enable mongod
sudo systemctl start mongod

# 3. Install PM2 globally
sudo npm install -g pm2

# 4. Clone and setup
git clone https://github.com/ArthurStore/disposablecam.git
cd disposablecam
npm install --production

# 5. Configure environment
cp .env.example .env
nano .env
# Set: MONGODB_URI, ADMIN_PIN, PORT

# 6. Start with PM2
pm2 start server.js --name "disposable-camera"
pm2 save
pm2 startup

# 7. (Optional) Nginx reverse proxy
sudo apt install -y nginx
```

Example Nginx config (`/etc/nginx/sites-available/camera`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/camera /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

## Importing Participants

### Option A: Admin Dashboard
Go to `/admin`, enter PIN, paste Markdown-formatted data:
```
001 | John Doe | L
002 | Jane Smith | P
```

### Option B: CLI Script
```bash
node scripts/import-participants.js participants.md
```

File format (pipe-separated):
```
No Peserta | Full Name | Gender
001 | John Doe | L
002 | Jane Smith | P
```

## URLs

| URL | Purpose |
|-----|---------|
| `/` | Mobile camera app (redirects desktop to `/live`) |
| `/live` | Live preview for projector |
| `/admin` | PIN-protected admin dashboard |
| `/recap` | Public full album recap with filters |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/disposable-camera` | MongoDB connection string |
| `ADMIN_PIN` | `1234` | Admin dashboard PIN |
| `UPLOAD_MAX_SIZE` | `50` | Max upload size in MB |

## Project Structure

```
├── public/
│   ├── css/          style.css, admin.css
│   ├── js/           app.js, chat.js, admin.js, live-preview.js, sw.js
│   ├── images/       icon.png, male-icon.svg, female-icon.svg
│   ├── index.html    Mobile camera app
│   ├── admin.html    Admin dashboard
│   ├── live-preview.html  Projector view
│   ├── recap.html    Full album recap
│   └── manifest.json PWA manifest
├── uploads/          Physical file storage
├── models/           Mongoose schemas (User, Photo, Message, AdminPin)
├── config/           Database connection
├── scripts/          CLI utilities
├── server.js         Express + Socket.io server
└── package.json
```

## License

MIT
