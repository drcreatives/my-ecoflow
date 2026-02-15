# Quick cPanel PostgreSQL Migration Guide

## 🎯 Goal
Move database from Supabase (PostgreSQL) to cPanel (PostgreSQL) while keeping frontend on Vercel.

**Key Advantage:** No schema changes needed - staying with PostgreSQL!

## ⚡ Quick Start (5 Steps)

### 1️⃣ Create PostgreSQL Database in cPanel
```
cPanel → PostgreSQL® Databases
1. Create database: ecoflow_dashboard
   → Result: devrunor_ecoflow_dashboard
   
2. Create user: ecoflow_user
   → Result: devrunor_ecoflow_user
   → Set password and save it!
   
3. Add user to database with ALL PRIVILEGES
```

### 2️⃣ Run Migration Script
```bash
# Windows (double-click or run in terminal)
migrate-to-cpanel-postgres.bat

# Mac/Linux
bash migrate-to-cpanel-postgres.sh
```

### 3️⃣ Update .env.local (Script does this automatically)
```env
DATABASE_URL="postgresql://devrunor_ecoflow_user:YOUR_PASSWORD@YOUR_HOST:5432/devrunor_ecoflow_dashboard?sslmode=prefer"
```

### 4️⃣ Push Schema to PostgreSQL (Script does this automatically)
```bash
npx prisma generate
npx prisma db push
```

### 5️⃣ Update Vercel & Deploy
```
Vercel Dashboard → Settings → Environment Variables
Variable: DATABASE_URL
Value: postgresql://devrunor_ecoflow_user:PASSWORD@HOST:5432/devrunor_ecoflow_dashboard?sslmode=prefer
Environments: Production, Preview, Development
→ Save & Redeploy
```

## 📋 Connection String Format

```
postgresql://[USER]:[PASSWORD]@[HOST]:5432/[DATABASE]?sslmode=prefer

Example:
postgresql://devrunor_ecoflow_user:SecurePass123@server123.hostgator.com:5432/devrunor_ecoflow_dashboard?sslmode=prefer
```

**Important:** Notice the `devrunor_` prefix on both username and database!

## ✅ Verification

After migration, verify:
- [ ] `npx prisma db push` succeeds
- [ ] Tables appear in phpPgAdmin (cPanel → phpPgAdmin)
- [ ] `npm run dev` works locally
- [ ] Vercel deployment succeeds
- [ ] Production site works

## 🔧 Common Issues

**"Connection refused"**
→ Enable remote PostgreSQL access in cPanel → Remote PostgreSQL

**"Password authentication failed"**
→ Double-check: `devrunor_ecoflow_user` (not just `ecoflow_user`)

**"Database does not exist"**
→ Verify: `devrunor_ecoflow_dashboard` (not just `ecoflow_dashboard`)

**"SSL connection required"**
→ Use `?sslmode=prefer` or `?sslmode=require` in connection string

## 📚 Full Documentation

- **Detailed Guide:** `CPANEL_POSTGRESQL_MIGRATION.md`
- **Step-by-step Checklist:** `CPANEL_POSTGRESQL_CHECKLIST.md`
- **Original Prisma Schema:** `prisma/schema.prisma` (no changes needed!)

## 🎉 Advantages Over MySQL

✅ **No Schema Changes** - Keep existing Prisma schema  
✅ **Same Database Engine** - No compatibility issues  
✅ **UUID Support** - Native UUID types  
✅ **PostgreSQL Features** - JSON, arrays, advanced types  
✅ **Simpler Migration** - Just change connection string  
✅ **All Tools Work** - Existing Prisma migrations compatible  

## 🚀 Timeline

- **Database Setup:** 5 minutes
- **Run Script:** 2 minutes  
- **Local Testing:** 3 minutes
- **Vercel Update:** 5 minutes
- **Total:** ~15 minutes

## 🆘 Need Help?

1. Check `CPANEL_POSTGRESQL_CHECKLIST.md` for detailed steps
2. Check Vercel logs for deployment errors
3. Check phpPgAdmin to verify tables exist
4. Test connection with: `npx prisma studio`

---

**Ready to migrate?** Run the migration script and you'll be up and running in 15 minutes! 🚀
