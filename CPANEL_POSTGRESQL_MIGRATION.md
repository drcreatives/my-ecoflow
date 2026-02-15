# cPanel PostgreSQL Migration Guide

## 🎯 Goal
Move database from Supabase (PostgreSQL) to cPanel (PostgreSQL) while keeping frontend on Vercel.

**Key Advantage:** No schema changes needed! We're staying with PostgreSQL.

## ⚡ Quick Start (5 Steps)

### 1️⃣ Create PostgreSQL Database in cPanel

```
cPanel → PostgreSQL® Databases
1. Create database: ecoflow_dashboard
   → Result: devrunor_ecoflow_dashboard
   
2. Create user: ecoflow_user
   → Result: devrunor_ecoflow_user
   → Set strong password (save it!)
   
3. Grant ALL PRIVILEGES to user
   → Select devrunor_ecoflow_user
   → Select devrunor_ecoflow_dashboard
   → Click "Add User to Database"
   → Check ALL PRIVILEGES
   → Click "Make Changes"
```

### 2️⃣ Get Connection Details

```
cPanel → PostgreSQL® Databases → Remote PostgreSQL

Your cPanel PostgreSQL details:
- Host: localhost (or your cPanel server hostname)
- Port: 5432 (default PostgreSQL port)
- Database: devrunor_ecoflow_dashboard
- User: devrunor_ecoflow_user
- Password: [the password you set]
```

**Check Remote Access:**
- Go to "Remote PostgreSQL" section
- Add your local IP address if testing locally
- Add `%` for wildcard access (or Vercel's IP ranges)

### 3️⃣ Update .env.local

```env
# Replace Supabase connection string with cPanel PostgreSQL
DATABASE_URL="postgresql://devrunor_ecoflow_user:YOUR_PASSWORD@YOUR_CPANEL_HOST:5432/devrunor_ecoflow_dashboard?sslmode=prefer"
```

**Connection String Format:**
```
postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]?sslmode=prefer

Example:
postgresql://devrunor_ecoflow_user:SecurePass123@server123.hostgator.com:5432/devrunor_ecoflow_dashboard?sslmode=prefer
```

### 4️⃣ Push Schema to cPanel PostgreSQL

```bash
# Generate Prisma client
npx prisma generate

# Push schema to new database
npx prisma db push

# Verify tables were created
npx prisma studio
```

### 5️⃣ Update Vercel Environment Variables

```
Vercel Dashboard → Your Project → Settings → Environment Variables

Add/Update:
Variable: DATABASE_URL
Value: postgresql://devrunor_ecoflow_user:YOUR_PASSWORD@YOUR_HOST:5432/devrunor_ecoflow_dashboard?sslmode=prefer
Environment: Production, Preview, Development

Click "Save"
Redeploy your application
```

## 🔧 SSL/TLS Configuration

### Option 1: Prefer SSL (Recommended)
```env
DATABASE_URL="...?sslmode=prefer"
```
Tries SSL first, falls back to unencrypted if SSL fails.

### Option 2: Require SSL
```env
DATABASE_URL="...?sslmode=require"
```
Always use SSL, fail if SSL not available.

### Option 3: Disable SSL
```env
DATABASE_URL="...?sslmode=disable"
```
No SSL encryption (only use for local/trusted networks).

## 📊 Optional: Migrate Existing Data

If you want to move data from Supabase to cPanel:

### Method 1: Using Supabase Dashboard
```bash
# 1. Export from Supabase
Supabase Dashboard → Database → Backups → Export

# 2. Import to cPanel
cPanel → phpPgAdmin → Import
```

### Method 2: Using pg_dump/pg_restore
```bash
# Export from Supabase
pg_dump "postgresql://postgres:[SUPABASE_PASSWORD]@[SUPABASE_HOST]:5432/postgres" > backup.sql

# Import to cPanel
psql "postgresql://devrunor_ecoflow_user:[PASSWORD]@[CPANEL_HOST]:5432/devrunor_ecoflow_dashboard" < backup.sql
```

### Method 3: Manual Migration Script
```typescript
// scripts/migrate-data.ts
import { PrismaClient as SupabasePrisma } from '@prisma/client'
import { PrismaClient as CpanelPrisma } from '@prisma/client'

async function migrateData() {
  const supabase = new SupabasePrisma({
    datasources: { db: { url: process.env.SUPABASE_DATABASE_URL } }
  })
  
  const cpanel = new CpanelPrisma({
    datasources: { db: { url: process.env.DATABASE_URL } }
  })
  
  // Migrate users
  const users = await supabase.user.findMany()
  for (const user of users) {
    await cpanel.user.create({ data: user })
  }
  
  // Migrate devices
  const devices = await supabase.device.findMany()
  for (const device of devices) {
    await cpanel.device.create({ data: device })
  }
  
  // Migrate readings, settings, etc.
  console.log('Migration complete!')
}

migrateData()
```

## ✅ Verification Checklist

- [ ] PostgreSQL database created in cPanel (devrunor_ecoflow_dashboard)
- [ ] PostgreSQL user created (devrunor_ecoflow_user)
- [ ] User has ALL PRIVILEGES on database
- [ ] Remote access configured (if needed)
- [ ] .env.local updated with new connection string
- [ ] `npx prisma generate` succeeds
- [ ] `npx prisma db push` succeeds
- [ ] Tables visible in phpPgAdmin
- [ ] `npm run dev` works locally
- [ ] Can read/write data in development
- [ ] Vercel environment variables updated
- [ ] Vercel deployment succeeds
- [ ] Production site works
- [ ] Can read/write data in production

## 🔍 Testing Connection

Create a test script to verify connection:

```typescript
// scripts/test-cpanel-connection.ts
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function testConnection() {
  try {
    const client = await pool.connect()
    console.log('✅ Connected to cPanel PostgreSQL!')
    
    const result = await client.query('SELECT version()')
    console.log('PostgreSQL version:', result.rows[0].version)
    
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `)
    console.log('Tables:', tables.rows)
    
    client.release()
  } catch (error) {
    console.error('❌ Connection failed:', error)
  } finally {
    await pool.end()
  }
}

testConnection()
```

Run: `npx tsx scripts/test-cpanel-connection.ts`

## 🚨 Common Issues & Solutions

### Issue: "Connection refused"
**Solution:** Check if PostgreSQL remote access is enabled in cPanel.

### Issue: "Password authentication failed"
**Solution:** Verify username/password. Remember the `devrunor_` prefix.

### Issue: "Database does not exist"
**Solution:** Ensure database name includes `devrunor_` prefix.

### Issue: "SSL connection required"
**Solution:** Add `?sslmode=require` or `?sslmode=prefer` to connection string.

### Issue: "Too many connections"
**Solution:** Use connection pooling:
```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  connectionLimit = 10
}
```

### Issue: "Prepared statement already exists"
**Solution:** Add `?pgbouncer=true` to connection string if using PgBouncer:
```env
DATABASE_URL="...?sslmode=prefer&pgbouncer=true"
```

## 🎉 Advantages Over MySQL Migration

✅ **No Schema Changes:** Keep existing Prisma schema  
✅ **Same Database Engine:** No type conversion issues  
✅ **PostgreSQL Features:** Keep JSON, arrays, advanced types  
✅ **Simpler Migration:** Just change connection string  
✅ **UUID Support:** Native UUID support (vs cuid() in MySQL)  
✅ **Existing Tools:** All your current Prisma migrations work  

## 📝 cPanel PostgreSQL Access

After setup, you can manage your database via:

1. **phpPgAdmin** (cPanel → phpPgAdmin)
   - Browse tables
   - Run SQL queries
   - Import/export data
   - View database structure

2. **Command Line** (via cPanel Terminal)
   ```bash
   psql -h localhost -U devrunor_ecoflow_user -d devrunor_ecoflow_dashboard
   ```

3. **Prisma Studio** (local development)
   ```bash
   npx prisma studio
   ```

## 🔐 Security Best Practices

1. **Strong Password:** Use a complex password for database user
2. **Restrict Remote Access:** Only allow necessary IP addresses
3. **Use SSL:** Always use `sslmode=prefer` or `sslmode=require`
4. **Environment Variables:** Never commit DATABASE_URL to git
5. **Regular Backups:** Set up automated backups in cPanel
6. **Read-only Users:** Create separate read-only users for analytics

## 🚀 Deployment Workflow

```bash
# 1. Update local environment
echo 'DATABASE_URL="postgresql://devrunor_ecoflow_user:PASSWORD@HOST:5432/devrunor_ecoflow_dashboard?sslmode=prefer"' > .env.local

# 2. Push schema
npx prisma generate
npx prisma db push

# 3. Test locally
npm run dev

# 4. Commit changes (if any)
git add .
git commit -m "Migrate to cPanel PostgreSQL"
git push

# 5. Update Vercel
# Go to Vercel Dashboard → Settings → Environment Variables
# Update DATABASE_URL

# 6. Redeploy
# Vercel auto-deploys on git push, or manually trigger
```

## 📚 Additional Resources

- [Prisma PostgreSQL Documentation](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [PostgreSQL Connection Strings](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [cPanel PostgreSQL Documentation](https://docs.cpanel.net/cpanel/databases/postgresql-databases/)

## 🆘 Need Help?

1. Check cPanel error logs
2. Check Vercel deployment logs
3. Verify connection string format
4. Test connection with standalone script
5. Check PostgreSQL version compatibility
6. Verify Prisma version compatibility

---

**Ready to migrate?** Start with step 1 and work through each step carefully. The migration should take about 10-15 minutes total. Good luck! 🚀
