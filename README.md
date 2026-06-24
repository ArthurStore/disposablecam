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
- **Process Manager:** PM2 (cluster mode for multi-core utilization)

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

Open `http://localhost:3020` on your phone (mobile view) or desktop (auto-redirects to live preview).

---

## 🚀 Complete VPS Deployment Guide (Step-by-Step)

This guide walks you through hosting the Disposable Camera app from scratch on a **clean Linux VPS** (Ubuntu 22.04/24.04 — tested on Tencent Cloud, also works on AWS, DigitalOcean, Vultr, etc.).

### Prerequisites

- A Linux VPS with at least **1 vCPU, 1 GB RAM, 20 GB disk** (2 vCPU / 2 GB recommended)
- Root or sudo access via SSH
- A domain name (optional, but recommended for HTTPS)

---

### Step 1: Update the System

SSH into your VPS and update all packages:

```bash
# Connect to your VPS
ssh root@YOUR_VPS_IP

# Update package lists and upgrade installed packages
sudo apt update && sudo apt upgrade -y

# Install essential build tools
sudo apt install -y build-essential git curl wget unzip software-properties-common
```

---

### Step 2: Install Node.js (v18 LTS or v20 LTS)

We use the NodeSource repository for the latest LTS release:

```bash
# Download and run the NodeSource setup script (Node.js 18.x)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js (includes npm)
sudo apt install -y nodejs

# Verify installation
node --version    # Should show v18.x.x
npm --version     # Should show 9.x.x or 10.x.x
```

> **Note:** You can also use `setup_20.x` for Node.js 20 LTS.

---

### Step 3: Install and Configure MongoDB

#### 3a. Import the MongoDB GPG key

```bash
# Import MongoDB 7.0 public GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
```

#### 3b. Add the MongoDB repository

```bash
# For Ubuntu 22.04 (Jammy)
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# For Ubuntu 24.04 (Noble) — use the jammy repo (compatible)
# Same command as above works
```

#### 3c. Install MongoDB

```bash
sudo apt update
sudo apt install -y mongodb-org
```

#### 3d. Start and enable MongoDB

```bash
# Start MongoDB
sudo systemctl start mongod

# Enable auto-start on boot
sudo systemctl enable mongod

# Verify it's running
sudo systemctl status mongod
# Should show "active (running)"

# Test the connection
mongosh --eval "db.runCommand({ ping: 1 })"
# Should return { ok: 1 }
```

#### 3e. (Optional) Secure MongoDB

By default, MongoDB listens on `127.0.0.1` (localhost only), which is safe for a single-server setup. For additional security:

```bash
# Edit MongoDB config
sudo nano /etc/mongod.conf

# Ensure these lines exist:
#   net:
#     port: 27017
#     bindIp: 127.0.0.1

# Restart after changes
sudo systemctl restart mongod
```

---

### Step 4: Install PM2 (Process Manager)

PM2 keeps your app running 24/7, auto-restarts on crash, and utilizes all CPU cores in cluster mode:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify
pm2 --version
```

---

### Step 5: Clone and Set Up the Project

```bash
# Navigate to your preferred directory
cd /var/www    # or /home/ubuntu, or any directory you prefer

# Clone the repository
git clone https://github.com/ArthurStore/disposablecam.git
cd disposablecam

# Install production dependencies
npm install --production
```

---

### Step 6: Configure Environment Variables

```bash
# Create .env from the example
cp .env.example .env

# Edit with your settings
nano .env
```

Set the following values in `.env`:

```env
PORT=3020
MONGODB_URI=mongodb://localhost:27017/disposable-camera
ADMIN_PIN=YOUR_SECURE_PIN_HERE
NODE_ENV=production
UPLOAD_MAX_SIZE=50
```

> **Important:** Change `ADMIN_PIN` from the default `1234` to a secure PIN for production use.

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

---

### Step 7: Create the Logs Directory

```bash
mkdir -p logs
```

---

### Step 8: Start the App with PM2 (Cluster Mode)

The project includes an `ecosystem.config.js` file pre-configured for cluster mode:

```bash
# Start using the PM2 ecosystem config
pm2 start ecosystem.config.js

# Check the status — you should see multiple instances running
pm2 status

# View live logs
pm2 logs disposable-camera

# Monitor in real-time (CPU, memory, restarts)
pm2 monit
```

You should see output like:

```
┌─────────────────────┬────┬─────────┬──────┬───────┬────────┬─────────┐
│ App name            │ id │ mode    │ pid  │ status│ restart│ uptime  │
├─────────────────────┼────┼─────────┼──────┼───────┼────────┼─────────┤
│ disposable-camera   │ 0  │ cluster │ 1234 │ online│ 0      │ 5s      │
│ disposable-camera   │ 1  │ cluster │ 1235 │ online│ 0      │ 5s      │
│ ...                 │    │         │      │       │        │         │
└─────────────────────┴────┴─────────┴──────┴───────┴────────┴─────────┘
```

#### Make PM2 auto-start on boot

```bash
# Generate the startup script
pm2 startup

# PM2 will print a command — copy and run it (looks like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Save the current process list
pm2 save
```

Now your app will automatically restart after a server reboot.

#### Useful PM2 commands

```bash
pm2 status                         # Check app status
pm2 logs disposable-camera         # View logs
pm2 restart disposable-camera      # Restart all instances
pm2 reload disposable-camera       # Zero-downtime reload
pm2 stop disposable-camera         # Stop the app
pm2 delete disposable-camera       # Remove from PM2
pm2 monit                          # Real-time monitoring dashboard
```

---

### Step 9: Verify the App is Running

```bash
# Test from the server itself
curl -s http://localhost:3020/api/admin/stats
# Should return: {"totalUsers":0,"totalUploads":0,...}

# Check from your browser
# http://YOUR_VPS_IP:3020         → Mobile camera (or redirects to live preview on desktop)
# http://YOUR_VPS_IP:3020/admin   → Admin dashboard
# http://YOUR_VPS_IP:3020/live    → Projector view
# http://YOUR_VPS_IP:3020/recap   → Recap album
```

---

### Step 10: Configure Nginx Reverse Proxy (Recommended)

Nginx handles SSL termination, serves as a reverse proxy, and enables you to use port 80/443 instead of 3020:

```bash
# Install Nginx
sudo apt install -y nginx
```

#### Create the Nginx config

```bash
sudo nano /etc/nginx/sites-available/disposable-camera
```

Paste the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;    # Replace with your domain or VPS IP

    # Max upload size (match UPLOAD_MAX_SIZE in .env)
    client_max_body_size 50M;

    # Proxy to Node.js app
    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;

        # WebSocket support (required for Socket.io)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward real client info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long uploads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location ~* \.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)$ {
        proxy_pass http://127.0.0.1:3020;
        proxy_cache_valid 200 7d;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Enable the site and restart Nginx

```bash
# Create symlink to enable the site
sudo ln -s /etc/nginx/sites-available/disposable-camera /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

Now your app is accessible at `http://your-domain.com` (port 80).

---

### Step 11: Enable HTTPS with Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain and install SSL certificate
sudo certbot --nginx -d your-domain.com

# Certbot will automatically:
# - Obtain the certificate
# - Update your Nginx config
# - Set up auto-renewal

# Test auto-renewal
sudo certbot renew --dry-run
```

Your app is now accessible at `https://your-domain.com` with a valid SSL certificate.

---

### Step 12: Configure Firewall (UFW)

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'

# Enable the firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

### Step 13: Import Participants

#### Option A: Via Admin Dashboard (Web UI)

1. Open `https://your-domain.com/admin`
2. Enter your admin PIN
3. Scroll to **"Import Participants"**
4. Paste pipe-separated data:

```
001 | John Doe | L
002 | Jane Smith | P
003 | Ahmad Rizki | L
004 | Siti Nurhaliza | P
```

5. Click **Import**

#### Option B: Via CLI Script

```bash
cd /var/www/disposablecam

# Create a participant file
nano participants.md
```

Add participants in this format:

```
001 | John Doe | L
002 | Jane Smith | P
003 | Ahmad Rizki | L
```

Run the import:

```bash
node scripts/import-participants.js participants.md
```

---

### Maintenance & Troubleshooting

#### Updating the app

```bash
cd /var/www/disposablecam
git pull origin init
npm install --production
pm2 reload disposable-camera
```

#### Checking logs

```bash
# PM2 logs
pm2 logs disposable-camera --lines 100

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

#### Restarting services

```bash
sudo systemctl restart mongod        # Restart MongoDB
pm2 restart disposable-camera        # Restart the app
sudo systemctl restart nginx         # Restart Nginx
```

#### Backing up the database

```bash
# Create a backup
mongodump --db disposable-camera --out /var/backups/mongo/$(date +%Y%m%d)

# Restore from backup
mongorestore --db disposable-camera /var/backups/mongo/20240101/disposable-camera/
```

#### Backing up uploaded media

```bash
# Compress and backup uploads
tar -czf /var/backups/uploads-$(date +%Y%m%d).tar.gz /var/www/disposablecam/uploads/
```

#### Disk space management

```bash
# Check disk usage
df -h

# Check uploads folder size
du -sh /var/www/disposablecam/uploads/
```

---

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
| `PORT` | `3020` | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/disposable-camera` | MongoDB connection string |
| `ADMIN_PIN` | `1234` | Admin dashboard PIN |
| `UPLOAD_MAX_SIZE` | `50` | Max upload size in MB |

## PM2 Ecosystem Config

The `ecosystem.config.js` runs the app in **cluster mode** across all CPU cores:

```js
{
  name: 'disposable-camera',
  script: 'server.js',
  exec_mode: 'cluster',
  instances: 'max',        // Uses all available CPU cores
  env: {
    NODE_ENV: 'production',
    PORT: 3020
  }
}
```

## Project Structure

```
├── public/
│   ├── css/               style.css, admin.css
│   ├── js/                app.js, chat.js, admin.js, live-preview.js, sw.js
│   ├── images/            icon.png, male-icon.svg, female-icon.svg
│   ├── index.html         Mobile camera app
│   ├── admin.html         Admin dashboard
│   ├── live-preview.html  Projector view
│   ├── recap.html         Full album recap
│   └── manifest.json      PWA manifest
├── uploads/               Physical file storage
├── models/                Mongoose schemas (User, Photo, Message, AdminPin)
├── config/                Database connection
├── scripts/               CLI utilities (participant import)
├── logs/                  PM2 log files
├── server.js              Express + Socket.io server
├── ecosystem.config.js    PM2 cluster configuration
└── package.json
```

## License

MIT
