@echo off
REM cPanel PostgreSQL Migration Script for Windows
REM This script helps migrate from Supabase PostgreSQL to cPanel PostgreSQL

setlocal enabledelayedexpansion

echo ╔═══════════════════════════════════════════════════════════╗
echo ║   cPanel PostgreSQL Migration Script                      ║
echo ║   From: Supabase PostgreSQL                               ║
echo ║   To: cPanel PostgreSQL (devrunor_ prefix)                ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

REM Backup current .env.local
echo 📦 Creating backup of .env.local...
if exist .env.local (
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
    for /f "tokens=1-2 delims=/: " %%a in ('time /t') do (set mytime=%%a%%b)
    copy .env.local .env.local.backup.!mydate!_!mytime! >nul
    echo ✅ Backup created
) else (
    echo ⚠️  No .env.local found, will create new one
)
echo.

REM Get cPanel PostgreSQL credentials
echo 🔑 Please enter your cPanel PostgreSQL credentials:
echo.

set /p CPANEL_HOST="cPanel Host (e.g., server123.hostgator.com): "
set /p DB_PASSWORD="Database Password for devrunor_ecoflow_user: "
echo.

REM Build connection string
set DATABASE_URL=postgresql://devrunor_ecoflow_user:%DB_PASSWORD%@%CPANEL_HOST%:5432/devrunor_ecoflow_dashboard?sslmode=prefer

echo 📝 Updating .env.local...

if exist .env.local (
    REM Update existing DATABASE_URL
    findstr /B "DATABASE_URL=" .env.local >nul
    if !errorlevel! equ 0 (
        REM Backup old DATABASE_URL
        findstr /B "DATABASE_URL=" .env.local > .env.local.old_db_url
        REM Create temp file with updated DATABASE_URL
        (
            for /f "usebackq delims=" %%a in (.env.local) do (
                set line=%%a
                if "!line:~0,13!"=="DATABASE_URL=" (
                    echo DATABASE_URL="!DATABASE_URL!"
                ) else (
                    echo %%a
                )
            )
        ) > .env.local.tmp
        move /y .env.local.tmp .env.local >nul
        echo ✅ Updated existing DATABASE_URL
    ) else (
        REM Append DATABASE_URL
        echo. >> .env.local
        echo # cPanel PostgreSQL Database >> .env.local
        echo DATABASE_URL="!DATABASE_URL!" >> .env.local
        echo ✅ Added DATABASE_URL to .env.local
    )
) else (
    REM Create new .env.local
    (
        echo # cPanel PostgreSQL Database
        echo DATABASE_URL="!DATABASE_URL!"
        echo.
        echo # Copy other environment variables from Supabase setup
        echo # NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
        echo # NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
        echo # ECOFLOW_ACCESS_KEY=your_access_key
        echo # ECOFLOW_SECRET_KEY=your_secret_key
    ) > .env.local
    echo ✅ Created new .env.local
)
echo.

REM Show connection info (masked password)
set MASKED_URL=!DATABASE_URL:%DB_PASSWORD%=****!
echo 🔗 Connection String:
echo !MASKED_URL!
echo.

REM Generate Prisma Client
echo 🔧 Generating Prisma Client...
call npx prisma generate
if !errorlevel! neq 0 (
    echo ❌ Prisma generate failed
    exit /b 1
)
echo ✅ Prisma Client generated
echo.

REM Push schema to database
echo 📤 Pushing schema to cPanel PostgreSQL...
echo This will create all tables in devrunor_ecoflow_dashboard
echo.
set /p CONFIRM="Continue? (y/n): "
if /i "!CONFIRM!"=="y" (
    call npx prisma db push
    if !errorlevel! neq 0 (
        echo ❌ Schema push failed
        echo.
        echo ⚠️  Check the error above and verify:
        echo   - Database exists: devrunor_ecoflow_dashboard
        echo   - User has privileges: devrunor_ecoflow_user
        echo   - Connection string is correct
        echo   - Remote access is enabled in cPanel
        exit /b 1
    )
    echo ✅ Schema pushed successfully
) else (
    echo ⚠️  Skipped schema push
)
echo.

REM Test connection
echo 🧪 Testing database connection...
call npx tsx -e "import { Pool } from 'pg'; const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT NOW() as now, version() as version').then(r => { console.log('✅ Connected!'); console.log('Time:', r.rows[0].now); console.log('Version:', r.rows[0].version.split(' ')[0] + ' ' + r.rows[0].version.split(' ')[1]); process.exit(0); }).catch(e => { console.error('❌ Connection failed:', e.message); process.exit(1); })"
if !errorlevel! neq 0 (
    echo ❌ Database connection failed
    echo Please check your credentials and try again
    exit /b 1
)
echo ✅ Database connection successful
echo.

REM Summary
echo ╔═══════════════════════════════════════════════════════════╗
echo ║   Migration Complete! 🎉                                  ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo 📋 Next Steps:
echo.
echo 1. Test locally:
echo    npm run dev
echo.
echo 2. Verify in phpPgAdmin:
echo    cPanel → phpPgAdmin → devrunor_ecoflow_dashboard
echo.
echo 3. Update Vercel Environment Variables:
echo    Vercel Dashboard → Settings → Environment Variables
echo    Update DATABASE_URL with:
echo    !MASKED_URL!
echo.
echo 4. Deploy to Vercel:
echo    git add .env.local.backup.*
echo    git commit -m "Migrate to cPanel PostgreSQL"
echo    git push
echo.
echo ✅ Local development is now using cPanel PostgreSQL!
echo.
echo ⚠️  Remember:
echo   - Your .env.local backup is saved
echo   - Don't commit .env.local to git
echo   - Update Vercel environment variables
echo   - Test thoroughly before going live
echo.

pause
