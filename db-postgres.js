const { Pool } = require('pg');

// Use DATABASE_URL from environment (Render provides this automatically)
// For local testing, set DATABASE_URL in .env file
const isRenderDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com');

console.log('DB Connection Config:');
console.log('- URL Provided:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  console.log('- URL Host:', process.env.DATABASE_URL.split('@')[1]); // Log host only for safety
}
console.log('- SSL Enabled:', isRenderDb || process.env.NODE_ENV === 'production');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRenderDb || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database schema
async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // ---- USERS TABLE (with avatar + age/height/weight/bio) ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "avatarUrl" TEXT,
        age INTEGER,
        "heightCm" REAL,
        "weightKg" REAL,
        bio TEXT,
        "totalPoints" INTEGER DEFAULT 0,
        "targetDaysPerWeek" INTEGER DEFAULT 3,
        "isAdmin" INTEGER DEFAULT 0
      )
    `);

    // ---- DAILY SUBMISSIONS (photos/videos) ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "fileUrl" TEXT NOT NULL,
        type TEXT NOT NULL,
        "workoutType" TEXT DEFAULT 'gym',
        points INTEGER DEFAULT 0,
        status TEXT DEFAULT 'uploaded',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ---- DAILY STATUS (for penalties/rest days) ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_status (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        date TEXT NOT NULL,
        uploaded INTEGER DEFAULT 0,
        "pointsDelta" INTEGER DEFAULT 0,
        UNIQUE("userId", date),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ---- WEEKLY QUESTS ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS quests (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        "startDate" TEXT NOT NULL,
        "endDate" TEXT NOT NULL,
        "pointsReward" INTEGER DEFAULT 5
      )
    `);

    // ---- WEEKLY QUEST SUBMISSIONS ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS quest_submissions (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "questId" INTEGER NOT NULL,
        "fileUrl" TEXT,
        status TEXT DEFAULT 'pending',
        points INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("userId", "questId"),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY("questId") REFERENCES quests(id) ON DELETE CASCADE
      )
    `);

    // ---- WEEKLY OFF DAYS (1 rest day per week) ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_off_days (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        date TEXT NOT NULL,
        year INTEGER NOT NULL,
        week INTEGER NOT NULL,
        UNIQUE("userId", year, week),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query('COMMIT');
    console.log('✅ PostgreSQL database schema initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Helper functions for queries
async function runQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

async function getAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function getOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

module.exports = {
  pool,
  initializeDatabase,
  runQuery,
  getAll,
  getOne
};
