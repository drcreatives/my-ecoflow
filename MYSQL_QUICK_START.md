# Quick MySQL Migration Guide

## 🎯 Goal
Move database from Supabase (PostgreSQL) to cPanel (MySQL) while keeping frontend on Vercel.

## ⚡ Quick Start (5 Steps)

### 1️⃣ Create MySQL Database in cPanel
```
cPanel → MySQL® Databases
- Create database: devrunor_my_ecoflow
- Create user: devrunor_ecoflow_user
- Password: ;iw}U~++xH8}a$5A
- Grant ALL PRIVILEGES
- Save credentials
```

### 2️⃣ Run Migration Script
```bash
# Windows
migrate-to-mysql.bat

# Mac/Linux
bash migrate-to-mysql.sh
```

### 3️⃣ Update .env.local
```env
DATABASE_URL="mysql://username_ecoflow_user:YOUR_PASSWORD@YOUR_HOST:3306/username_ecoflow_dashboard"
```

### 4️⃣ Push Schema to MySQL
```bash
npx prisma db push
```

### 5️⃣ Update Vercel
```
Vercel Dashboard → Settings → Environment Variables
Add: DATABASE_URL = (your MySQL connection string)
Redeploy
```

## 📋 Connection String Format

```
mysql://USER:PASSWORD@HOST:3306/DATABASE

Example:
mysql://johndoe_ecoflow:SecurePass123@server123.hostgator.com:3306/johndoe_ecoflow_dashboard
```

## ✅ Verification

After migration, verify:
- [ ] `npx prisma db push` succeeds
- [ ] Tables appear in phpMyAdmin
- [ ] `npm run dev` works locally
- [ ] Vercel deployment succeeds
- [ ] Production site works

## 🔧 Common Issues

**"Access denied"**
→ Check username/password in connection string

**"Unknown database"**
→ Verify database name includes cPanel prefix

**"Connection timeout"**
→ Check if cPanel allows remote MySQL connections

**Prisma errors**
→ Run `npx prisma generate` again

## 📚 Full Docs

- Detailed Guide: `MYSQL_MIGRATION.md`
- Step-by-step: `MYSQL_CHECKLIST.md`
- MySQL Schema: `prisma/schema.mysql.prisma`

## 🆘 Need Help?

1. Check Vercel logs for errors
2. Check phpMyAdmin for database structure
3. Verify environment variables are set
4. Test connection string in a simple script

## 🎉 Benefits

✅ Keep Vercel for fast global frontend  
✅ Use familiar cPanel/phpMyAdmin  
✅ Full database control  
✅ Easy backups via cPanel  
✅ Cost-effective solution
