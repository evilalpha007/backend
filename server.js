// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const cron = require('node-cron');
const path = require('path');
const db = require('./db');

const app = express();

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;

// Points + windows
const DAILY_UPLOAD_POINTS = 3;
const DAILY_MISS_PENALTY = -1;

const WEEKLY_QUEST_POINTS = 5;
const WEEKLY_MISS_PENALTY = -3;

// Upload window: 6 PM–10 PM (24-hr format)
const DAILY_START_HOUR = 18;
const DAILY_END_HOUR = 22;

// ---------- MIDDLEWARE ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret:  'super-secret-key',
  resave: false,
  saveUninitialized: false
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- MULTER SETUP ----------
// Daily uploads
const dailyStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const dailyUpload = multer({ storage: dailyStorage });

// Quest uploads
const questStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/quests'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const questUpload = multer({ storage: questStorage });
// Avatar uploads
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/avatars'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const avatarUpload = multer({ storage: avatarStorage });


// ---------- HELPERS ----------
function isWithinUploadWindow() {
  const now = new Date();
  const hour = now.getHours(); // 0–23
  return hour >= DAILY_START_HOUR && hour < DAILY_END_HOUR;
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function getYearWeek(dateObj) {
  const year = dateObj.getFullYear();

  // ISO-like week calculation
  const temp = new Date(dateObj.getTime());
  temp.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
  const week1 = new Date(temp.getFullYear(), 0, 4);
  const week = 1 + Math.round(
    ((temp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );

  return { year, week };
}


function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

async function getCurrentUser(req) {
  if (!req.session.userId) return null;
  return await getOne(`SELECT * FROM users WHERE id = ?`, [req.session.userId]);
}

function requireAdmin(req, res, next) {
  getCurrentUser(req).then(user => {
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  }).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Error checking admin' });
  });
}

// ---------- AUTH ROUTES ----------
app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, password, targetDaysPerWeek } = req.body;
    const hash = await bcrypt.hash(password, 10);

    await runQuery(
      `INSERT INTO users (username, email, passwordHash, targetDaysPerWeek)
       VALUES (?, ?, ?, ?)`,
      [username, email, hash, targetDaysPerWeek || 3]
    );

    res.redirect('/login.html');
  } catch (err) {
    console.error(err);
    res.status(400).send('Signup failed (email may already be used).');
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await getOne(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) return res.status(401).send('Invalid email or password');

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).send('Invalid email or password');

    req.session.userId = user.id;
    res.redirect('/index.html');
  } catch (err) {
    console.error(err);
    res.status(500).send('Login error');
  }
});

app.get('/api/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Who am I?
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = await getOne(
    `SELECT
        id,
        username,
        email,
        avatarUrl,
        age,
        heightCm,
        weightKg,
        bio,
        totalPoints,
        targetDaysPerWeek,
        isAdmin
     FROM users
     WHERE id = ?`,
    [req.session.userId]
  );
  res.json({ user });
});
// ---------- Update avatar ----------
app.post('/api/me/avatar', requireLogin, avatarUpload.single('avatar'), async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    
    const filePath = '/uploads/avatars/' + req.file.filename;

    await runQuery(
      `UPDATE users SET avatarUrl = ? WHERE id = ?`,
      [filePath, userId]
    );

    res.json({ message: 'Avatar updated.', avatarUrl: filePath });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Failed to update avatar: ' + err.message });
  }
});
// ---------- Update personal details (age, height, weight, bio) ----------
app.post('/api/me/details', requireLogin, async (req, res) => {
  try {
    let { age, heightCm, weightKg, bio } = req.body;
    const userId = req.session.userId;

    // convert to numbers (or null)
    age = age ? parseInt(age, 10) : null;
    heightCm = heightCm ? parseFloat(heightCm) : null;
    weightKg = weightKg ? parseFloat(weightKg) : null;

    await runQuery(
      `UPDATE users
       SET age = ?, heightCm = ?, weightKg = ?, bio = ?
       WHERE id = ?`,
      [age, heightCm, weightKg, bio || null, userId]
    );

    res.json({ message: 'Profile details updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update details.' });
  }
});



// ---------- LEADERBOARD ----------
app.get('/api/leaderboard', async (req, res) => {
  try {
    const rows = await getAll(
      `SELECT id, username, totalPoints
       FROM users
       ORDER BY totalPoints DESC, username ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});



// ---------- DAILY UPLOAD ----------
app.post('/api/upload', requireLogin, dailyUpload.single('file'), async (req, res) => {
  try {
    const now = new Date();

    // Rule: uploads only allowed between 6 PM and 10 PM
    if (!isWithinUploadWindow()) {
      return res.status(400).json({
        error: 'Uploads allowed only between 6 PM and 10 PM.'
      });
    }
    const userId = req.session.userId;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // 1) Workout type from form ('gym' or 'home')
    const workoutType = req.body.workoutType === 'home' ? 'home' : 'gym';

    // 2) Detect media type (photo or video)
    const mime = req.file.mimetype;
    const mediaType = mime.startsWith('video/') ? 'video' : 'photo';

    // 3) Rule: home workout must be video only
    if (workoutType === 'home' && mediaType !== 'video') {
      return res.status(400).json({ error: 'Home workout uploads must be video only.' });
    }

    const fileUrl = '/uploads/daily/' + req.file.filename;

    // 4) Insert submission with workoutType
    await runQuery(
      `INSERT INTO submissions (userId, fileUrl, type, workoutType, points, status)
       VALUES (?, ?, ?, ?, ?, 'uploaded')`,
      [userId, fileUrl, mediaType, workoutType, DAILY_UPLOAD_POINTS]
    );

    // 5) Mark daily_status as uploaded (no penalty)
    const today = todayDateStr();
    await runQuery(
      `INSERT INTO daily_status (userId, date, uploaded, pointsDelta)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(userId, date)
       DO UPDATE SET uploaded = 1, pointsDelta = ?`,
      [userId, today, DAILY_UPLOAD_POINTS, DAILY_UPLOAD_POINTS]
    );

    // 6) Add points to user
    await runQuery(
      `UPDATE users SET totalPoints = totalPoints + ? WHERE id = ?`,
      [DAILY_UPLOAD_POINTS, userId]
    );

    res.json({
      message: `Upload saved as ${workoutType === 'home' ? 'Home workout' : 'Gym'} (${mediaType}).`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// ---------- Daily off day (one per week) ----------
app.post('/api/daily-off', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    const today = todayDateStr();
    const { year, week } = getYearWeek(now);

    // 1) Check if they already used off-day this week
    const existing = await getOne(
      `SELECT id FROM weekly_off_days
       WHERE userId = ? AND year = ? AND week = ?`,
      [userId, year, week]
    );

    if (existing) {
      return res.status(400).json({
        error: 'You already used your one off day for this week.'
      });
    }

    // 2) Save this off day
    await runQuery(
      `INSERT INTO weekly_off_days (userId, date, year, week)
       VALUES (?, ?, ?, ?)`,
      [userId, today, year, week]
    );

    // 3) Mark daily_status so cron knows there is NO penalty for today
    await runQuery(
      `INSERT INTO daily_status (userId, date, uploaded, pointsDelta)
       VALUES (?, ?, 0, 0)
       ON CONFLICT(userId, date)
       DO UPDATE SET uploaded = 0, pointsDelta = 0`,
      [userId, today]
    );

    res.json({ message: 'Rest day saved for this week. No -1 penalty today.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not set rest day.' });
  }
});

// ---------- WEEKLY QUEST ----------
app.get('/api/current-quest', async (req, res) => {
  try {
    const today = todayDateStr();
    const quest = await getOne(
      `SELECT * FROM quests
       WHERE startDate <= ? AND endDate >= ?
       ORDER BY startDate DESC
       LIMIT 1`,
      [today, today]
    );
    res.json({ quest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/quest-upload', requireLogin, questUpload.single('file'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const today = todayDateStr();

    const quest = await getOne(
      `SELECT * FROM quests
       WHERE startDate <= ? AND endDate >= ?
       ORDER BY startDate DESC
       LIMIT 1`,
      [today, today]
    );

    if (!quest) {
      return res.status(400).json({ error: 'No active quest.' });
    }

    const existing = await getOne(
      `SELECT id FROM quest_submissions
       WHERE questId = ? AND userId = ? AND status = 'approved'`,
      [quest.id, userId]
    );
    if (existing) {
      return res.status(400).json({ error: 'Quest already completed.' });
    }

    const filePath = req.file ? '/uploads/quests/' + req.file.filename : null;

    await runQuery(
      `INSERT INTO quest_submissions
        (questId, userId, fileUrl, type, status, points, createdAt)
       VALUES (?, ?, ?, ?, 'approved', ?, datetime('now'))`,
      [quest.id, userId, filePath, 'file', WEEKLY_QUEST_POINTS]
    );

    await runQuery(
      `UPDATE users SET totalPoints = totalPoints + ? WHERE id = ?`,
      [WEEKLY_QUEST_POINTS, userId]
    );

    res.json({ message: `Quest completed! +${WEEKLY_QUEST_POINTS} points.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Quest upload failed' });
  }
});

// ---------- PROFILE ----------
app.get('/api/my-uploads', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await getOne(
      `SELECT username, totalPoints, targetDaysPerWeek
       FROM users WHERE id = ?`,
      [userId]
    );

    const uploads = await getAll(
      `SELECT fileUrl, type, points, status, createdAt
       FROM submissions
       WHERE userId = ?
       ORDER BY datetime(createdAt) DESC`,
      [userId]
    );

    const questUploads = await getAll(
      `SELECT q.title, qs.fileUrl, qs.points, qs.status, qs.createdAt
       FROM quest_submissions qs
       JOIN quests q ON q.id = qs.questId
       WHERE qs.userId = ?
       ORDER BY datetime(qs.createdAt) DESC`,
      [userId]
    );

    res.json({ user, uploads, questUploads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});
// ---------- Public profile for any user (for others to view) ----------
app.get('/api/user/:id', requireLogin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = await getOne(
      `SELECT
         id,
         username,
         avatarUrl,
         age,
         heightCm,
         weightKg,
         bio,
         totalPoints,
         targetDaysPerWeek
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const uploads = await getAll(
      `SELECT fileUrl, type, points, status, createdAt
       FROM submissions
       WHERE userId = ?
       ORDER BY datetime(createdAt) DESC`,
      [userId]
    );

    const questUploads = await getAll(
      `SELECT q.title, qs.fileUrl, qs.points, qs.status, qs.createdAt
       FROM quest_submissions qs
       JOIN quests q ON q.id = qs.questId
       WHERE qs.userId = ?
       ORDER BY datetime(qs.createdAt) DESC`,
      [userId]
    );

    res.json({ user, uploads, questUploads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user profile.' });
  }
});


// ---------- ADMIN & QUEST CREATION ----------
// TEMP: make current user admin
app.get('/make-me-admin', requireLogin, async (req, res) => {
  try {
    await runQuery(
      `UPDATE users SET isAdmin = 1 WHERE id = ?`,
      [req.session.userId]
    );
    res.send('You are now admin. Go to admin.html.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not make admin');
  }
});
// List all users for admin
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await getAll(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.totalPoints,
         u.isAdmin,
         COUNT(DISTINCT s.id)  AS uploadCount,
         COUNT(DISTINCT qs.id) AS questCount
       FROM users u
       LEFT JOIN submissions s      ON s.userId = u.id
       LEFT JOIN quest_submissions qs ON qs.userId = u.id
       GROUP BY u.id
       ORDER BY u.totalPoints DESC`
    );
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});
// Delete a user and related data
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Optional safety: don't let admin delete themselves via UI
    if (userId === req.session.userId) {
      return res.status(400).json({ error: "You can't delete your own account from admin panel." });
    }

    // Remove related records first
    await runQuery(`DELETE FROM submissions WHERE userId = ?`, [userId]);
    await runQuery(`DELETE FROM daily_status WHERE userId = ?`, [userId]);
    await runQuery(`DELETE FROM quest_submissions WHERE userId = ?`, [userId]);

    // Finally remove the user
    await runQuery(`DELETE FROM users WHERE id = ?`, [userId]);

    res.json({ message: 'User and related data deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});


app.post('/api/admin/quests', requireAdmin, async (req, res) => {
  try {
    const { title, description, startDate, endDate } = req.body;
    await runQuery(
      `INSERT INTO quests (title, description, startDate, endDate, pointsReward)
       VALUES (?, ?, ?, ?, ?)`,
      [title, description, startDate, endDate, WEEKLY_QUEST_POINTS]
    );
    res.json({ message: 'Quest created.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create quest' });
  }
});
// List all quests for admin with basic stats
app.get('/api/admin/quests', requireAdmin, async (req, res) => {
  try {
    const quests = await getAll(
      `SELECT
         q.*,
         SUM(CASE WHEN qs.status = 'approved' THEN 1 ELSE 0 END) AS completedCount,
         SUM(CASE WHEN qs.status = 'missed' THEN 1 ELSE 0 END)   AS missedCount
       FROM quests q
       LEFT JOIN quest_submissions qs ON qs.questId = q.id
       GROUP BY q.id
       ORDER BY q.startDate DESC`
    );
    res.json({ quests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load quests' });
  }
});
// Delete a quest (and its submissions)
app.delete('/api/admin/quests/:id', requireAdmin, async (req, res) => {
  try {
    const questId = req.params.id;

    // delete related submissions first
    await runQuery(
      `DELETE FROM quest_submissions WHERE questId = ?`,
      [questId]
    );

    // then delete the quest
    await runQuery(
      `DELETE FROM quests WHERE id = ?`,
      [questId]
    );

    res.json({ message: 'Quest deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete quest' });
  }
});


// ---------- CRON JOBS ----------
// Daily: -1 for missed upload (but skip if off day = pointsDelta 0)
cron.schedule('30 23 * * *', async () => {
  try {
    const today = todayDateStr();
    const users = await getAll(`SELECT id FROM users`);

    for (const u of users) {
      const row = await getOne(
        `SELECT uploaded, pointsDelta
         FROM daily_status
         WHERE userId = ? AND date = ?`,
        [u.id, today]
      );

      // Case 1: they uploaded today → no penalty
      if (row && row.uploaded === 1) {
        continue;
      }

      // Case 2: they set off-day (pointsDelta = 0) → no penalty
      if (row && row.pointsDelta === 0) {
        continue;
      }

      // Case 3: no row at all (or some other weird state) → apply -1
      await runQuery(
        `UPDATE users SET totalPoints = totalPoints + ? WHERE id = ?`,
        [DAILY_MISS_PENALTY, u.id]
      );

      await runQuery(
        `INSERT INTO daily_status (userId, date, uploaded, pointsDelta)
         VALUES (?, ?, 0, ?)
         ON CONFLICT(userId, date)
         DO UPDATE SET uploaded = 0, pointsDelta = ?`,
        [u.id, today, DAILY_MISS_PENALTY, DAILY_MISS_PENALTY]
      );
    }

    console.log('Daily penalties applied for', today);
  } catch (err) {
    console.error('Daily cron error:', err);
  }
});

// Weekly: -3 for missed quest (for quests ending today)
cron.schedule('45 23 * * *', async () => {
  try {
    const today = todayDateStr();
    const quests = await getAll(
      `SELECT * FROM quests WHERE endDate = ?`,
      [today]
    );
    const users = await getAll(`SELECT id FROM users`);

    for (const quest of quests) {
      for (const u of users) {
        const completed = await getOne(
          `SELECT id FROM quest_submissions
           WHERE questId = ? AND userId = ? AND status = 'approved'`,
          [quest.id, u.id]
        );

        if (!completed) {
          await runQuery(
            `UPDATE users SET totalPoints = totalPoints + ? WHERE id = ?`,
            [WEEKLY_MISS_PENALTY, u.id]
          );

          await runQuery(
            `INSERT INTO quest_submissions
              (questId, userId, fileUrl, type, status, points, createdAt)
             VALUES (?, ?, NULL, 'none', 'missed', ?, datetime('now'))`,
            [quest.id, u.id, WEEKLY_MISS_PENALTY]
          );
        }
      }
    }

    console.log('Weekly quest penalties applied for', today);
  } catch (err) {
    console.error('Weekly cron error:', err);
  }
});

// ---------- START SERVER ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

