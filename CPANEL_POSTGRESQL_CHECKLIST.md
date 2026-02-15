# cPanel PostgreSQL Migration - Quick Checklist

## ✅ Pre-Migration Checklist

- [ ] cPanel login credentials ready
- [ ] Strong password prepared for database user
- [ ] Local development environment working
- [ ] Current Supabase connection tested
- [ ] Backup of current data (optional)

## 📋 Migration Steps

### Phase 1: cPanel Database Setup (5 minutes)

- [ ] **Step 1.1:** Log into cPanel
- [ ] **Step 1.2:** Navigate to "PostgreSQL® Databases"
- [ ] **Step 1.3:** Create database: `ecoflow_dashboard`
  - Result: `devrunor_ecoflow_dashboard`
- [ ] **Step 1.4:** Create user: `ecoflow_user`
  - Result: `devrunor_ecoflow_user`
  - Save password securely
- [ ] **Step 1.5:** Add user to database
  - Select user: `devrunor_ecoflow_user`
  - Select database: `devrunor_ecoflow_dashboard`
  - Click "Add User to Database"
- [ ] **Step 1.6:** Grant ALL PRIVILEGES
  - Check ALL PRIVILEGES checkbox
  - Click "Make Changes"
- [ ] **Step 1.7:** Configure Remote Access (if needed)
  - Go to "Remote PostgreSQL" section
  - Add your IP address
  - Or add `%` for wildcard (less secure)

### Phase 2: Connection String Setup (2 minutes)

- [ ] **Step 2.1:** Get cPanel PostgreSQL host
  - Usually: `localhost` or `your-server.hostgator.com`
  - Default port: `5432`
- [ ] **Step 2.2:** Build connection string:
  ```
  postgresql://devrunor_ecoflow_user:[PASSWORD]@[HOST]:5432/devrunor_ecoflow_dashboard?sslmode=prefer
  ```
- [ ] **Step 2.3:** Update `.env.local`:
  ```env
  DATABASE_URL="postgresql://devrunor_ecoflow_user:YourPassword@your-host:5432/devrunor_ecoflow_dashboard?sslmode=prefer"
  ```
- [ ] **Step 2.4:** Save and verify no typos

### Phase 3: Local Schema Push (3 minutes)

- [ ] **Step 3.1:** Generate Prisma client
  ```bash
  npx prisma generate
  ```
- [ ] **Step 3.2:** Push schema to cPanel PostgreSQL
  ```bash
  npx prisma db push
  ```
- [ ] **Step 3.3:** Verify success message
- [ ] **Step 3.4:** Check phpPgAdmin for tables
  - cPanel → phpPgAdmin
  - Select `devrunor_ecoflow_dashboard`
  - Verify tables exist:
    - [ ] users
    - [ ] devices
    - [ ] device_readings
    - [ ] device_settings
    - [ ] daily_summaries
    - [ ] device_alerts

### Phase 4: Local Testing (5 minutes)

- [ ] **Step 4.1:** Start development server
  ```bash
  npm run dev
  ```
- [ ] **Step 4.2:** Test application locally
  - [ ] Login works
  - [ ] Dashboard loads
  - [ ] Devices page loads
  - [ ] Can add device
  - [ ] No database errors in console
- [ ] **Step 4.3:** Optional: Run Prisma Studio
  ```bash
  npx prisma studio
  ```
  - [ ] Can browse tables
  - [ ] Can view/edit data

### Phase 5: Vercel Deployment (5 minutes)

- [ ] **Step 5.1:** Go to Vercel Dashboard
- [ ] **Step 5.2:** Select your project
- [ ] **Step 5.3:** Go to Settings → Environment Variables
- [ ] **Step 5.4:** Find or add `DATABASE_URL`
- [ ] **Step 5.5:** Update value:
  ```
  postgresql://devrunor_ecoflow_user:[PASSWORD]@[HOST]:5432/devrunor_ecoflow_dashboard?sslmode=prefer
  ```
- [ ] **Step 5.6:** Select environments:
  - [ ] Production
  - [ ] Preview
  - [ ] Development
- [ ] **Step 5.7:** Click "Save"
- [ ] **Step 5.8:** Trigger redeployment
  - Option A: Push to git
  - Option B: Manual redeploy in Vercel

### Phase 6: Production Testing (5 minutes)

- [ ] **Step 6.1:** Wait for deployment to complete
- [ ] **Step 6.2:** Visit production URL
- [ ] **Step 6.3:** Test critical features:
  - [ ] Login/signup works
  - [ ] Dashboard loads without errors
  - [ ] Devices page displays
  - [ ] Can add new device
  - [ ] Device readings display
  - [ ] Settings page works
- [ ] **Step 6.4:** Check Vercel logs for errors
  - [ ] No database connection errors
  - [ ] No SSL errors
  - [ ] No authentication errors

## 🔍 Verification Commands

```bash
# Test connection
npx tsx -e "import { Pool } from 'pg'; const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT NOW()').then(r => console.log('✅', r.rows)).catch(e => console.error('❌', e))"

# Check Prisma connection
npx prisma db pull

# View database in browser
npx prisma studio
```

## 🚨 Troubleshooting

### ❌ "Connection refused"
- [ ] Check if PostgreSQL is running on cPanel
- [ ] Verify remote access is configured
- [ ] Check firewall settings
- [ ] Verify port 5432 is correct

### ❌ "Authentication failed"
- [ ] Double-check username: `devrunor_ecoflow_user`
- [ ] Verify password is correct
- [ ] Ensure no extra spaces in connection string
- [ ] Check if user has proper privileges

### ❌ "Database does not exist"
- [ ] Verify database name: `devrunor_ecoflow_dashboard`
- [ ] Check for typos in connection string
- [ ] Ensure database was created successfully
- [ ] Verify `devrunor_` prefix is included

### ❌ "SSL error"
- [ ] Try `sslmode=prefer` (most flexible)
- [ ] Try `sslmode=disable` (less secure, local only)
- [ ] Try `sslmode=require` (most secure)
- [ ] Check cPanel SSL configuration

### ❌ Vercel deployment fails
- [ ] Check Vercel logs for specific error
- [ ] Verify DATABASE_URL is set in Vercel
- [ ] Ensure connection string is correct
- [ ] Check if cPanel allows Vercel's IP ranges

## 📊 Optional: Data Migration

### If you want to keep existing Supabase data:

- [ ] **Method 1:** Export from Supabase Dashboard
  - [ ] Supabase → Database → Backups
  - [ ] Export to SQL file
  - [ ] Import via phpPgAdmin

- [ ] **Method 2:** Use pg_dump
  ```bash
  # Export
  pg_dump "YOUR_SUPABASE_URL" > backup.sql
  
  # Import
  psql "postgresql://devrunor_ecoflow_user:PASSWORD@HOST:5432/devrunor_ecoflow_dashboard" < backup.sql
  ```

- [ ] **Method 3:** Manual migration script
  - [ ] Create migration script
  - [ ] Test with small dataset
  - [ ] Run full migration
  - [ ] Verify data integrity

## ✅ Post-Migration Checklist

- [ ] All tables created successfully
- [ ] Local development works
- [ ] Production deployment successful
- [ ] All features working in production
- [ ] Data migrated (if applicable)
- [ ] Old Supabase connection documented
- [ ] Team notified of migration
- [ ] Documentation updated
- [ ] Backup strategy in place

## 🎉 Success Indicators

You've successfully migrated when:
- ✅ `npx prisma db push` succeeds without errors
- ✅ Local `npm run dev` works perfectly
- ✅ Production site loads without errors
- ✅ Can create, read, update, delete data
- ✅ No database errors in Vercel logs
- ✅ phpPgAdmin shows all tables
- ✅ Authentication works end-to-end

## 📝 Rollback Plan (If Needed)

If migration fails, rollback:
1. [ ] Revert `.env.local` to Supabase connection
2. [ ] Revert Vercel environment variable
3. [ ] Redeploy on Vercel
4. [ ] Verify old connection works
5. [ ] Debug issue before retry

## 🎯 Estimated Timeline

- **Database Setup:** 5 minutes
- **Connection Config:** 2 minutes  
- **Schema Push:** 3 minutes
- **Local Testing:** 5 minutes
- **Vercel Update:** 5 minutes
- **Production Testing:** 5 minutes
- **Total:** ~25 minutes

## 📞 Support Resources

- **cPanel Documentation:** Check your hosting provider's docs
- **Prisma Docs:** https://www.prisma.io/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs
- **Vercel Docs:** https://vercel.com/docs

---

**Ready?** Print this checklist and check off each step as you complete it. Take your time and verify each step before moving to the next! 🚀
