# KAYBOII'S STORAGE SITE v3

A Google Drive–style file storage site with:
- User accounts (SQLite)
- Multi-file upload with drag & drop
- Optional per-file password
- Shareable links (work without login)
- Trash bin + restore
- Admin dashboard
- Tailwind CSS design

## 🚀 Run locally
```bash
npm install
npm start
```
Visit http://localhost:3000

## 🌍 Deploy on Render
1. Push code to GitHub
2. On Render.com → New Web Service
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add Environment variable: `SESSION_SECRET=your_secret`
6. Deploy → get a live URL like https://your-app.onrender.com
