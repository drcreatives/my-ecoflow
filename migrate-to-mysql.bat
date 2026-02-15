@echo off
REM MySQL Migration Script for Windows
REM This script helps migrate from PostgreSQL to MySQL

echo =========================================
echo EcoFlow Dashboard - MySQL Migration
echo =========================================
echo.

REM Step 1: Backup current Prisma schema
echo Step 1: Backing up current Prisma schema...
if exist "prisma\schema.prisma" (
    copy /Y "prisma\schema.prisma" "prisma\schema.postgres.backup" > nul
    echo [32mBackup created: prisma\schema.postgres.backup[0m
) else (
    echo [33mNo existing schema found[0m
)

REM Step 2: Replace schema with MySQL version
echo.
echo Step 2: Switching to MySQL schema...
if exist "prisma\schema.mysql.prisma" (
    copy /Y "prisma\schema.mysql.prisma" "prisma\schema.prisma" > nul
    echo [32mMySQL schema activated[0m
) else (
    echo [31mMySQL schema file not found![0m
    exit /b 1
)

REM Step 3: Update dependencies
echo.
echo Step 4: Updating Prisma dependencies...
call npm install @prisma/client@latest
call npm install -D prisma@latest

if errorlevel 1 (
    echo [31mFailed to update dependencies[0m
    exit /b 1
)

echo [32mDependencies updated[0m

REM Step 4: Generate Prisma Client
echo.
echo Step 5: Generating Prisma Client for MySQL...
call npx prisma generate

if errorlevel 1 (
    echo [31mFailed to generate Prisma Client[0m
    exit /b 1
)

echo [32mPrisma Client generated[0m

REM Instructions for next steps
echo.
echo =========================================
echo Next Steps - Manual Action Required:
echo =========================================
echo.
echo 1. Create MySQL database in cPanel:
echo    - Database name: ecoflow_dashboard
echo    - Create user with ALL PRIVILEGES
echo.
echo 2. Update your .env.local with MySQL connection:
echo    DATABASE_URL="mysql://user:password@host:3306/database"
echo.
echo 3. Push schema to MySQL database:
echo    npx prisma db push
echo.
echo 4. Verify tables in phpMyAdmin
echo.
echo 5. ^(Optional^) Migrate data from PostgreSQL:
echo    - Export data from Supabase
echo    - Import to MySQL via phpMyAdmin
echo.
echo 6. Update Vercel environment variables:
echo    - Add new DATABASE_URL with MySQL connection
echo.
echo 7. Test the application locally:
echo    npm run dev
echo.
echo =========================================
echo Migration preparation complete!
echo =========================================
echo.
pause
