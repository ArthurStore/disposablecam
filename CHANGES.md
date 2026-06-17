# Disposable Camera — UI/UX Overhaul + Subdirectory Fix

## 1. CRITICAL: Sub-path support (`/cam` or any base)

- **`server.js`** — All routes, static files, and Socket.IO are now mounted on
  a configurable `BASE_PATH` (env var). Set `BASE_PATH=/cam` to serve the app
  at `https://yourdomain.com/cam/`. Socket.IO is automatically served at
  `BASE_PATH + /socket.io`. A bare `/` redirects to the base path.
- **All HTML files** now use `<base href="./">` and **relative URLs** for CSS,
  JS, images, manifest, service worker, and inter-page links. Works at root or
  under any subdirectory with zero rebuild.
- **`public/js/app.js`, `chat.js`, `admin.js`** — every `fetch()` / `<img src>`
  / `<video src>` builds URLs from `window.location.pathname`, so API calls
  (`api/...`), uploads (`uploads/...`), and Socket.IO (`io({ path: BASE + 'socket.io' })`)
  all resolve correctly under `/cam`.

To deploy under `/cam`:
```bash
BASE_PATH=/cam node server.js
```
Or, behind a reverse proxy, simply proxy `/cam/*` to the app — the client
adapts automatically.

## 2. UI/UX Overhaul (premium dark mode)

### Viewfinder
- **9:16 aspect ratio** (was 3:4)
- Rounded 22px corners with subtle inner highlight + outer shadow
- Soft radial vignette for a real-lens feel
- **Rule-of-thirds grid** toggle button
- Decorative **focus reticle** at center
- **HUD overlay** (bottom-left): ISO · resolution · live clock — monospace
- **Mode pill** (top-right): PHOTO / VIDEO with color shift
- **REC pill** with live elapsed timer (`MM:SS`)
- Glassmorphic caption pill at the bottom

### Camera controls
- 5-button bar: Flip · **Mirror toggle** · Shutter · Mode · Grid
- **Dedicated mirror button** with active state (independent of front/rear)
- Shutter ring grows to 78px, white border, animated pulse while recording
- Video mode shows red inner circle that collapses to a square while recording
- Mechanical shutter blades (top + bottom) with cubic-bezier easing

### Visual system
- New token palette: warm amber accent (`#ffb547`) → orange (`#ff6b35`) gradient
- SF Pro Display / Inter typography
- Glassmorphic header with sticky safe-area padding
- Gradient gender-icon ring (blue for male, pink for female)
- Premium shadows, glow effects, and inner highlights everywhere

### Gallery
- **Always-visible delete button** (trash SVG icon, not emoji) on every
  thumbnail — top-right, glass background, turns red on hover
- Square cards with hover lift, 12px radius
- Responsive grid: 3 cols mobile → 4 cols tablet → 5 cols desktop

### Chat
- Slide-up bottom sheet with drag-handle indicator
- Self-messages get gradient amber background
- Tabular numerals for timestamps
- Gradient send button with glow

### Registration modal
- Gradient camera icon tile
- Glass backdrop blur
- Focused input with amber glow ring

## 3. Files changed
```
public/index.html              # Full UI rewrite, relative paths, base href
public/admin.html              # Relative paths, base href
public/recap.html              # Relative paths, base href
public/css/style.css           # Complete overhaul
public/js/app.js               # Relative paths + mirror/grid/HUD/timer logic
public/js/chat.js              # Subdir-safe Socket.IO path
public/js/admin.js             # Relative API paths
server.js                      # BASE_PATH support, Express router, Socket.IO path
CHANGES.md                     # This file
```
