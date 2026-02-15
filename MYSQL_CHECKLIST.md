# MySQL Migration Checklist

## Pre-Migration Checklist

- [ ] I have access to cPanel
- [ ] I have phpMyAdmin access
- [ ] I have my MySQL database credentials ready
- [ ] I have backed up any existing data from Supabase (if needed)
- [ ] I understand this will change the database provider only, not the frontend hosting

---

## Migration Steps Checklist

### Phase 1: cPanel Database Setup

- [ ] **Create MySQL Database in cPanel**
  - Go to cPanel → MySQL® Databases
  - Create database: `ecoflow_dashboard`
  - Note full name: `username_ecoflow_dashboard`

- [ ] **Create Database User**
  - Username: `ecoflow_user`
  - Generate strong password
  - Save credentials securely

- [ ] **Grant Privileges**
  - Add user to database
  - Grant ALL PRIVILEGES
  - Confirm changes

- [ ] **Note Connection Details**
  ```
  Host: ___________________________
  Database: ___________________________
  Username: ___________________________
  Password: ___________________________
  Port: 3306
  ```

### Phase 2: Update Local Project

- [ ] **Run Migration Script**
  ```bash
  # Windows
  migrate-to-mysql.bat
  
  # Linux/Mac
  bash migrate-to-mysql.sh
  ```

- [ ] **Update .env.local**
  ```env
  DATABASE_URL="mysql://user:password@host:3306/database"
  ```
  Replace with your actual credentials

- [ ] **Test Prisma Connection**
  ```bash
  npx prisma db push
  ```
  This creates tables in MySQL

- [ ] **Verify in phpMyAdmin**
  - Login to phpMyAdmin
  - Check tables exist:
    - [ ] users
    - [ ] devices
    - [ ] device_readings
    - [ ] device_settings
    - [ ] daily_summaries
    - [ ] device_alerts

### Phase 3: Data Migration (If Needed)

Choose one option:

#### Option A: Fresh Start (No Data Migration)
- [ ] Skip to Phase 4 - you'll start with empty tables

#### Option B: Export/Import via phpMyAdmin
- [ ] Export data from Supabase as CSV
- [ ] Import CSV files in phpMyAdmin
- [ ] Verify data imported correctly

#### Option C: Use Migration Script
- [ ] Contact me to create a custom data migration script
- [ ] Run migration script
- [ ] Verify all data transferred

### Phase 4: Update Application Code

Most code should work as-is, but verify:

- [ ] **Test locally**
  ```bash
  npm run dev
  ```

- [ ] **Test these features:**
  - [ ] User registration
  - [ ] User login
  - [ ] Device registration
  - [ ] Device readings display
  - [ ] Historical data
  - [ ] API endpoints

- [ ] **Check browser console for errors**
- [ ] **Check terminal for database errors**

### Phase 5: Deploy to Vercel

- [ ] **Update Vercel Environment Variables**
  1. Go to Vercel Dashboard
  2. Select your project
  3. Go to Settings → Environment Variables
  4. Add/Update `DATABASE_URL`:
     ```
     mysql://username:password@host:3306/database
     ```
  5. Apply to: Production, Preview, Development

- [ ] **Commit and Push Changes**
  ```bash
  git add .
  git commit -m "Migrate to MySQL database"
  git push origin main
  ```

- [ ] **Verify Vercel Deployment**
  - Check deployment logs for errors
  - Test production site
  - Verify database connections work

### Phase 6: Post-Migration Testing

- [ ] **Test in Production:**
  - [ ] User registration works
  - [ ] User login works
  - [ ] Device management works
  - [ ] Readings are being saved
  - [ ] Historical data loads
  - [ ] No database errors in Vercel logs

- [ ] **Performance Check:**
  - [ ] Pages load quickly
  - [ ] API responses are fast
  - [ ] No timeout errors

### Phase 7: Cleanup (Optional)

- [ ] **Backup Old PostgreSQL Data**
  - Export from Supabase for safekeeping
  - Store backup securely

- [ ] **Update Documentation**
  - Update README with MySQL info
  - Document connection details (securely)

- [ ] **Remove Supabase (if not using for auth)**
  - Or keep Supabase only for authentication
  - Remove unused environment variables

---

## Troubleshooting Checklist

### Connection Issues

- [ ] Verified MySQL credentials are correct
- [ ] Checked database name includes cPanel prefix
- [ ] Confirmed user has ALL PRIVILEGES
- [ ] Tested connection string format
- [ ] Checked if SSL is required/supported
- [ ] Verified cPanel allows remote connections (for Vercel)

### Prisma Issues

- [ ] Ran `npx prisma generate`
- [ ] Cleared node_modules and reinstalled
- [ ] Checked Prisma Client version matches
- [ ] Verified schema syntax is correct for MySQL

### Deployment Issues

- [ ] Verified Vercel has correct DATABASE_URL
- [ ] Checked Vercel build logs for errors
- [ ] Confirmed functions region matches database region
- [ ] Tested API routes individually

### Performance Issues

- [ ] Added indexes to frequently queried columns
- [ ] Checked query performance in phpMyAdmin
- [ ] Considered connection pooling
- [ ] Reviewed slow query logs

---

## Rollback Plan (If Needed)

If something goes wrong:

- [ ] **Restore PostgreSQL schema**
  ```bash
  cp prisma/schema.postgres.backup prisma/schema.prisma
  npx prisma generate
  ```

- [ ] **Revert environment variables**
  - Restore original DATABASE_URL
  - Redeploy to Vercel

- [ ] **Document what went wrong**
  - Save error messages
  - Note the step where it failed

---

## Success Criteria

Migration is complete when:

- [✓] All tables created in MySQL
- [✓] Application runs locally without errors
- [✓] Application deploys to Vercel successfully
- [✓] All features work in production
- [✓] No database connection errors
- [✓] Performance is acceptable

---

## Support

If you encounter issues:

1. Check MYSQL_MIGRATION.md for detailed troubleshooting
2. Review Vercel deployment logs
3. Check phpMyAdmin for database structure
4. Verify connection string format
5. Test database connection from Vercel serverless function

---

## Notes

Date Started: _______________  
Date Completed: _______________  
MySQL Host: _______________  
Database Name: _______________  
Issues Encountered: _______________  
_______________  
_______________  

