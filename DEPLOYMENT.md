# OV Fitness Freaks League - Render Deployment Guide

## 🚀 Render Pe Deploy Kaise Karein

### Step 1: Environment Variables Setup

Render dashboard mein jaake ye environment variables add karein:

```
PORT=3000
SESSION_SECRET=apna-bahut-strong-random-secret-key-yahan-dalein
NODE_ENV=production
```

**Important:** `SESSION_SECRET` ko random aur strong banayein!

### Step 2: Build Command
```
npm install
```

### Step 3: Start Command
```
npm start
```

### Step 4: Database (SQLite)

**⚠️ IMPORTANT:** Render pe SQLite file-based database **persist nahi hoga** kyunki Render ephemeral storage use karta hai. Har restart pe data loss ho jayega.

**Solutions:**

#### Option A: PostgreSQL Use Karein (Recommended)
1. Render pe free PostgreSQL database create karein
2. Code mein `sqlite3` ko `pg` (PostgreSQL) se replace karein
3. Database migrations run karein

#### Option B: Render Disk Use Karein (Paid)
1. Render Disk attach karein (paid feature)
2. Database file ko disk pe store karein
3. `/var/data/league.db` jaise path use karein

#### Option C: External Database
- Railway.app pe free PostgreSQL
- Supabase
- PlanetScale

### Step 5: Uploads Folder

Uploads bhi persist nahi honge. Solutions:

1. **Cloudinary** - Images/videos ke liye (recommended)
2. **AWS S3** - File storage
3. **Render Disk** - Paid option

### Step 6: Deployment Steps

1. **GitHub pe push karein:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Render Dashboard:**
   - New Web Service create karein
   - GitHub repo connect karein
   - Environment variables add karein
   - Deploy button click karein

### Step 7: Post-Deployment

1. Admin account banane ke liye:
   - `/api/signup` se account create karein
   - `/make-me-admin` endpoint visit karein

2. Database check karein ki properly create ho raha hai

## 🔧 Local Development

```bash
cd backend
npm install
npm start
```

Server: http://localhost:3000

## 📝 Notes

- SQLite production ke liye ideal nahi hai
- File uploads ke liye cloud storage use karein
- Environment variables ko secure rakhein
- Database backups regularly lein (agar persist kar rahe ho)

## 🆘 Common Issues

1. **Database reset ho jata hai:** Render restart pe SQLite data loss
   - Solution: PostgreSQL migrate karein

2. **Uploads gayab ho jate hain:** Ephemeral storage
   - Solution: Cloudinary/S3 use karein

3. **Session expire ho jate hain:** Memory-based sessions
   - Solution: Redis session store use karein (production mein)
