@echo off
REM EcoFlow Dashboard - cPanel Deployment Script (Windows)
REM This script prepares the production build for cPanel deployment

echo.
echo ========================================
echo EcoFlow Dashboard - cPanel Deployment
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies
        exit /b 1
    )
)

REM Clean previous builds
echo Cleaning previous builds...
if exist ".next" rmdir /s /q .next
if exist "out" rmdir /s /q out
if exist "deploy-package" rmdir /s /q deploy-package
if exist "ecoflow-dashboard-cpanel.zip" del /q ecoflow-dashboard-cpanel.zip

REM Build the project
echo.
echo Building production bundle...
call npm run build

if errorlevel 1 (
    echo Build failed!
    exit /b 1
)

echo.
echo Build completed successfully!
echo.

REM Create deployment package directory
echo Creating deployment package...
mkdir deploy-package
mkdir deploy-package\.next

REM Copy standalone server files
echo   - Copying standalone server...
xcopy /E /I /Y .next\standalone\* deploy-package\ > nul

REM Copy static assets
echo   - Copying static assets...
xcopy /E /I /Y .next\static deploy-package\.next\static\ > nul

REM Copy public files
echo   - Copying public files...
xcopy /E /I /Y public deploy-package\public\ > nul

REM Create production environment template
echo   - Creating .env.production template...
(
echo # Production Environment Variables
echo # Copy this file to .env.production and fill in your values
echo.
echo # Database
echo DATABASE_URL=postgresql://user:password@host:5432/database
echo.
echo # Supabase
echo NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
echo NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
echo SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
echo.
echo # EcoFlow API
echo ECOFLOW_ACCESS_KEY=your_access_key
echo ECOFLOW_SECRET_KEY=your_secret_key
echo.
echo # App Configuration
echo NEXT_PUBLIC_APP_URL=https://yourdomain.com
echo NODE_ENV=production
echo PORT=3000
) > deploy-package\.env.production.example

REM Create README for deployment
echo   - Creating deployment README...
(
echo EcoFlow Dashboard - Deployment Package
echo ======================================
echo.
echo This package contains the production build of the EcoFlow Dashboard.
echo.
echo Contents:
echo ---------
echo - server.js           : Main server file
echo - .next/              : Next.js build output
echo - public/             : Static assets
echo - package.json        : Dependencies
echo - .env.production.example : Environment variables template
echo.
echo Deployment Steps:
echo -----------------
echo 1. Upload all files to your cPanel directory
echo 2. Copy .env.production.example to .env.production
echo 3. Edit .env.production with your production values
echo 4. In cPanel Setup Node.js App:
echo    - Application root: your directory path
echo    - Application startup file: server.js
echo    - Application mode: Production
echo    - Node.js version: 18.x or higher
echo 5. Click "Restart" to start the application
echo.
echo For detailed instructions, see CPANEL_DEPLOYMENT.md
) > deploy-package\README.txt

REM Create package info
echo   - Creating package info...
(
echo EcoFlow Dashboard - Production Build
echo =====================================
echo.
echo Build Date: %date% %time%
echo.
echo Package Contents:
echo - Standalone server ^(self-contained^)
echo - Static assets ^(.next/static^)
echo - Public files ^(public/^)
echo - Environment template ^(.env.production.example^)
echo.
echo Deployment Target: cPanel with Node.js support
echo Minimum Node.js Version: 18.x
echo.
echo For deployment instructions, see README.txt
) > deploy-package\PACKAGE_INFO.txt

REM Create compressed archive using PowerShell
echo.
echo Creating compressed archive...
powershell -command "Compress-Archive -Path deploy-package\* -DestinationPath ecoflow-dashboard-cpanel.zip -Force"

echo.
echo ========================================
echo Deployment package created successfully!
echo ========================================
echo.
echo Package Location:
echo   Directory: .\deploy-package\
echo   Archive:   .\ecoflow-dashboard-cpanel.zip
echo.
echo Next Steps:
echo   1. Review deploy-package\.env.production.example
echo   2. Upload ecoflow-dashboard-cpanel.zip to cPanel
echo   3. Extract in your target directory
echo   4. Configure .env.production with your values
echo   5. Setup Node.js app in cPanel (see CPANEL_DEPLOYMENT.md)
echo.
echo Ready for deployment!
echo.
pause
