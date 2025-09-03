// server.js — KAYBOII'S STORAGE SITE v3
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'supersecret';

// Ensure uploads folder exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// DB init
const dbPromise = open({
  filename: path.join(__dirname, 'database.sqlite'),
  driver: sqlite3.Database
});

(async () => {
  const db = await dbPromise;
  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    filename TEXT,
    originalname TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    share_id TEXT,
    file_password TEXT,
    trashed INTEGER DEFAULT 0
  )`);
})();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Multer setup
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const userDir = path.join(UPLOADS_DIR, String(req.session.user.id));
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
  }
});
const upload = multer({ storage });

// Auth middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Routes
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.redirect('/dashboard');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = await dbPromise;
  const user = await db.get('SELECT * FROM users WHERE email = ?', email);
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = { id: user.id, email: user.email };
    return res.redirect('/dashboard');
  }
  res.render('login', { error: 'Invalid email or password' });
});

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const db = await dbPromise;
  try {
    await db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hash]);
    res.redirect('/login');
  } catch {
    res.render('register', { error: 'Email already exists' });
  }
});

app.get('/dashboard', requireLogin, async (req, res) => {
  const db = await dbPromise;
  const files = await db.all('SELECT * FROM files WHERE user_id = ? AND trashed = 0 ORDER BY created_at DESC', req.session.user.id);
  const trash = await db.all('SELECT * FROM files WHERE user_id = ? AND trashed = 1', req.session.user.id);
  res.render('dashboard', { user: req.session.user, files, trash });
});

app.post('/upload', requireLogin, upload.array('files'), async (req, res) => {
  const { filePassword } = req.body;
  const db = await dbPromise;
  for (const file of req.files) {
    const shareId = crypto.randomBytes(8).toString('hex');
    await db.run('INSERT INTO files (user_id, filename, originalname, size, share_id, file_password) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.user.id, file.filename, file.originalname, file.size, shareId, filePassword || null]);
  }
  res.redirect('/dashboard');
});

// Public share link
app.get('/file/:shareId', async (req, res) => {
  const { shareId } = req.params;
  const db = await dbPromise;
  const file = await db.get('SELECT * FROM files WHERE share_id = ?', shareId);
  if (!file) return res.status(404).send('File not found');
  const filePath = path.join(UPLOADS_DIR, String(file.user_id), file.filename);
  res.download(filePath, file.originalname);
});

// Move to trash
app.post('/trash/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const db = await dbPromise;
  await db.run('UPDATE files SET trashed = 1 WHERE id = ? AND user_id = ?', [id, req.session.user.id]);
  res.redirect('/dashboard');
});

// Restore from trash
app.post('/restore/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const db = await dbPromise;
  await db.run('UPDATE files SET trashed = 0 WHERE id = ? AND user_id = ?', [id, req.session.user.id]);
  res.redirect('/dashboard');
});

// Permanently delete
app.post('/delete/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const db = await dbPromise;
  const file = await db.get('SELECT * FROM files WHERE id = ? AND user_id = ?', [id, req.session.user.id]);
  if (file) {
    const filePath = path.join(UPLOADS_DIR, String(file.user_id), file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.run('DELETE FROM files WHERE id = ?', id);
  }
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Start server
app.listen(PORT, () => {
  console.log(`KAYBOII'S STORAGE SITE v3 running on port ${PORT}`);
});
