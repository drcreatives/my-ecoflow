# MySQL Migration Guide - Moving from Supabase PostgreSQL to cPanel MySQL

## Overview

This guide will help you migrate your EcoFlow Dashboard database from Supabase (PostgreSQL) to cPanel MySQL while keeping the frontend on Vercel.

## Prerequisites

- cPanel account with MySQL database access
- phpMyAdmin access
- Existing Supabase database with data (optional - for data migration)

---

## Part 1: Setup MySQL Database in cPanel

### Step 1: Create MySQL Database

1. **Login to cPanel**
2. **Go to "MySQL® Databases"**
3. **Create New Database:**
   - Database Name: `ecoflow_dashboard` (cPanel will prefix with your username)
   - Click "Create Database"
   - Note the full database name: `username_ecoflow_dashboard`

### Step 2: Create Database User

1. **In MySQL® Databases, scroll to "Add New User"**
2. **Create user:**
   - Username: `ecoflow_user`
   - Password: Generate a strong password
   - Click "Create User"
   - **SAVE THE PASSWORD SECURELY**

### Step 3: Grant User Privileges

1. **Scroll to "Add User To Database"**
2. **Select:**
   - User: `username_ecoflow_user`
   - Database: `username_ecoflow_dashboard`
3. **Click "Add"**
4. **Grant ALL PRIVILEGES**
5. **Click "Make Changes"**

### Step 4: Get Database Connection Details

You'll need these for your connection string:

```
Host: localhost (or your cPanel server hostname)
Database: username_ecoflow_dashboard
Username: username_ecoflow_user
Password: [your generated password]
Port: 3306
```

---

## Part 2: Update Prisma Schema for MySQL

The Prisma schema needs to be updated to work with MySQL. I'll create a new schema file for you.

### Changes Required:

1. **Provider**: Change from `postgresql` to `mysql`
2. **UUID**: MySQL doesn't have native UUID, use `cuid()` or auto-increment
3. **DateTime**: MySQL uses different defaults
4. **JSON fields**: Slightly different syntax
5. **Cascading**: MySQL requires specific foreign key setup

---

## Part 3: Configure Connection String

### For Local Development:

Create/Update `.env.local`:

```env
# MySQL Database (cPanel)
DATABASE_URL="mysql://username_ecoflow_user:your_password@your_cpanel_host:3306/username_ecoflow_dashboard?ssl-mode=REQUIRED"

# Keep Supabase for Authentication (or migrate to custom auth)
NEXT_PUBLIC_SUPABASE_URL=https://hzjdlprkyofqtgllgfhm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# EcoFlow API
ECOFLOW_ACCESS_KEY=2JDaLtMwMX2tE3WEEfddALhSJGbHjdeL
ECOFLOW_SECRET_KEY=GIgLC5YyTtGFfSrcFpUYKOdhJ9bsJoJ3pFKKw86JiUw

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### For Vercel Production:

Add environment variables in Vercel Dashboard:

```env
DATABASE_URL=mysql://username_ecoflow_user:your_password@your_cpanel_host:3306/username_ecoflow_database?ssl-mode=REQUIRED
```

**Important**: Replace:
- `username_ecoflow_user` with your actual MySQL username
- `your_password` with your MySQL password
- `your_cpanel_host` with your cPanel server hostname (e.g., `server123.hostgator.com`)
- `username_ecoflow_dashboard` with your actual database name

---

## Part 4: Migration Steps

### Step 1: Update Dependencies

```bash
npm install @prisma/client@latest
npm install -D prisma@latest
```

### Step 2: Apply New Schema

After I create the MySQL schema:

```bash
# Generate Prisma Client for MySQL
npx prisma generate

# Create tables in MySQL database
npx prisma db push
```

### Step 3: Verify Tables in phpMyAdmin

1. Login to phpMyAdmin
2. Select your database: `username_ecoflow_dashboard`
3. Verify these tables exist:
   - `users`
   - `devices`
   - `device_readings`
   - `device_settings`
   - `daily_summaries`
   - `device_alerts`

---

## Part 5: Migrate Existing Data (Optional)

If you have existing data in Supabase PostgreSQL:

### Option A: Manual Export/Import (Recommended for small datasets)

1. **Export from Supabase:**
   ```sql
   -- In Supabase SQL Editor, export each table
   COPY users TO STDOUT WITH CSV HEADER;
   COPY devices TO STDOUT WITH CSV HEADER;
   COPY device_readings TO STDOUT WITH CSV HEADER;
   ```

2. **Import to MySQL via phpMyAdmin:**
   - Select table
   - Click "Import"
   - Upload CSV file
   - Map columns correctly

### Option B: Use Migration Script

I can create a Node.js script that:
1. Connects to both databases
2. Fetches data from PostgreSQL
3. Inserts into MySQL
4. Handles ID conversions

---

## Part 6: Update Application Code

### Changes to `lib/database.ts`

The direct PostgreSQL queries need to be updated for MySQL syntax:

**PostgreSQL syntax:**
```typescript
const query = 'SELECT * FROM users WHERE id = $1'
```

**MySQL syntax:**
```typescript
const query = 'SELECT * FROM users WHERE id = ?'
```

I'll help you update all database query files.

---

## Part 7: SSL Configuration

### For cPanel MySQL with SSL:

```env
DATABASE_URL="mysql://user:password@host:3306/database?ssl-mode=REQUIRED&sslaccept=strict"
```

### Without SSL (if cPanel doesn't support it):

```env
DATABASE_URL="mysql://user:password@host:3306/database"
```

---

## Part 8: Deploy to Vercel

### Update Vercel Environment Variables:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update `DATABASE_URL` with MySQL connection string
3. Redeploy the application

```bash
# From your local machine
git add .
git commit -m "Migrate to MySQL database"
git push origin main
```

Vercel will automatically redeploy.

---

## Part 9: Testing Checklist

After migration, test:

- [ ] User registration works
- [ ] User login works
- [ ] Device registration works
- [ ] Device readings are saved
- [ ] Historical data displays correctly
- [ ] Device settings are persisted
- [ ] All API endpoints work
- [ ] No database connection errors in logs

---

## Part 10: Troubleshooting

### Connection Issues

**Error: "Access denied for user"**
- Verify username and password in connection string
- Check user has ALL PRIVILEGES on database
- Verify user can connect from remote hosts (if needed)

**Error: "Unknown database"**
- Verify database name includes cPanel username prefix
- Check database exists in phpMyAdmin

**Error: "SSL connection error"**
- Try without SSL: Remove `?ssl-mode=REQUIRED` from connection string
- Check if cPanel MySQL supports SSL connections

### Data Type Issues

**Error: "Unknown column type"**
- Verify Prisma schema uses MySQL-compatible types
- Run `npx prisma db push` to recreate tables

### Performance Issues

**Slow queries:**
- Add indexes in phpMyAdmin for frequently queried columns
- Check `explain` for query plans
- Consider connection pooling

---

## Part 11: Backup Strategy

### Automated Backups:

1. **Use cPanel Backup:**
   - cPanel → Backup → Download Database Backup
   - Schedule automatic backups

2. **Custom Backup Script:**
   ```bash
   mysqldump -u username_ecoflow_user -p username_ecoflow_dashboard > backup_$(date +%Y%m%d).sql
   ```

3. **Backup to Cloud Storage:**
   - Use cron jobs to backup to S3, Dropbox, etc.

---

## Benefits of This Setup

✅ **Keep Vercel for Frontend**: Fast, global CDN, automatic deployments  
✅ **MySQL on cPanel**: Full control, familiar phpMyAdmin interface  
✅ **Cost Effective**: Use existing cPanel hosting  
✅ **Easy Backups**: cPanel backup tools  
✅ **No PostgreSQL Lock-in**: Portable MySQL database  

---

## Next Steps

1. I'll create the MySQL-compatible Prisma schema
2. I'll update the database query files for MySQL syntax
3. You create the MySQL database in cPanel
4. We'll test the connection and migrate data
5. Deploy to Vercel with new DATABASE_URL

Ready to proceed? Let me know and I'll create the updated files!
