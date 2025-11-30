const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file in this folder
const dbPath = path.join(__dirname, 'league.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Make sure foreign keys are enabled
  db.run(`PRAGMA foreign_keys = ON`);

  // ---- USERS TABLE (with avatar + age/height/weight/bio) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      avatarUrl TEXT,
      age INTEGER,
      heightCm REAL,
      weightKg REAL,
      bio TEXT,
      totalPoints INTEGER DEFAULT 0,
      targetDaysPerWeek INTEGER DEFAULT 3,
      isAdmin INTEGER DEFAULT 0
    )
  `);

  // ---- DAILY SUBMISSIONS (photos/videos) ----
  db.run(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    fileUrl TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'photo' or 'video'
    workoutType TEXT DEFAULT 'gym',  -- 'gym' or 'home'
    points INTEGER DEFAULT 0,
    status TEXT DEFAULT 'uploaded',  -- uploaded / missed etc.
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  )
`);

  // ---- DAILY STATUS (for penalties/rest days) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      date TEXT NOT NULL,         -- YYYY-MM-DD
      uploaded INTEGER DEFAULT 0, -- 1 if uploaded in window
      pointsDelta INTEGER DEFAULT 0,
      UNIQUE(userId, date),
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ---- WEEKLY QUESTS ----
  db.run(`
    CREATE TABLE IF NOT EXISTS quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      startDate TEXT NOT NULL,   -- YYYY-MM-DD
      endDate TEXT NOT NULL,     -- YYYY-MM-DD
      pointsReward INTEGER DEFAULT 5
    )
  `);

  // ---- WEEKLY QUEST SUBMISSIONS ----
  db.run(`
    CREATE TABLE IF NOT EXISTS quest_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      questId INTEGER NOT NULL,
      fileUrl TEXT,
      status TEXT DEFAULT 'pending',  -- completed / missed
      points INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, questId),
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(questId) REFERENCES quests(id) ON DELETE CASCADE
    )
  `);

  // ---- WEEKLY OFF DAYS (1 rest day per week) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS weekly_off_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      date TEXT NOT NULL,      -- calendar date used as off
      year INTEGER NOT NULL,
      week INTEGER NOT NULL,
      UNIQUE(userId, year, week),
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});

module.exports = db;