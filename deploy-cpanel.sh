#!/bin/bash

# EcoFlow Dashboard - cPanel Deployment Script
# This script prepares the production build for cPanel deployment

echo "🚀 EcoFlow Dashboard - cPanel Deployment Preparation"
echo "=================================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf .next
rm -rf out
rm -rf deploy-package

# Build the project
echo "🔨 Building production bundle..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build completed successfully!"
echo ""

# Create deployment package directory
echo "📦 Creating deployment package..."
mkdir -p deploy-package
mkdir -p deploy-package/.next

# Copy standalone server files
echo "  → Copying standalone server..."
cp -r .next/standalone/* deploy-package/

# Copy static assets
echo "  → Copying static assets..."
cp -r .next/static deploy-package/.next/

# Copy public files
echo "  → Copying public files..."
cp -r public deploy-package/

# Create production environment template
echo "  → Creating .env.production template..."
cat > deploy-package/.env.production.example << 'EOF'
# Production Environment Variables
# Copy this file to .env.production and fill in your values

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# EcoFlow API
ECOFLOW_ACCESS_KEY=your_access_key
ECOFLOW_SECRET_KEY=your_secret_key

# App Configuration
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
PORT=3000
EOF

# Create README for deployment
echo "  → Creating deployment README..."
cat > deploy-package/README.txt << 'EOF'
EcoFlow Dashboard - Deployment Package
======================================

This package contains the production build of the EcoFlow Dashboard.

Contents:
---------
- server.js           : Main server file
- .next/              : Next.js build output
- public/             : Static assets
- package.json        : Dependencies
- .env.production.example : Environment variables template

Deployment Steps:
-----------------
1. Upload all files to your cPanel directory
2. Copy .env.production.example to .env.production
3. Edit .env.production with your production values
4. In cPanel Setup Node.js App:
   - Application root: your directory path
   - Application startup file: server.js
   - Application mode: Production
   - Node.js version: 18.x or higher
5. Click "Restart" to start the application

For detailed instructions, see CPANEL_DEPLOYMENT.md
EOF

# Create package info
echo "  → Creating package info..."
cat > deploy-package/PACKAGE_INFO.txt << EOF
EcoFlow Dashboard - Production Build
=====================================

Build Date: $(date)
Build Version: $(node -p "require('./package.json').version")
Node Version: $(node --version)
Next.js Version: $(node -p "require('./package.json').dependencies.next")

Package Contents:
- Standalone server (self-contained)
- Static assets (.next/static)
- Public files (public/)
- Environment template (.env.production.example)

Deployment Target: cPanel with Node.js support
Minimum Node.js Version: 18.x

For deployment instructions, see README.txt
EOF

# Create compressed archive
echo ""
echo "📦 Creating compressed archive..."
cd deploy-package
zip -r ../ecoflow-dashboard-cpanel.zip . -q
cd ..

echo "✅ Deployment package created successfully!"
echo ""
echo "📦 Package Location:"
echo "   Directory: ./deploy-package/"
echo "   Archive:   ./ecoflow-dashboard-cpanel.zip"
echo ""
echo "📋 Next Steps:"
echo "   1. Review deploy-package/.env.production.example"
echo "   2. Upload ecoflow-dashboard-cpanel.zip to cPanel"
echo "   3. Extract in your target directory"
echo "   4. Configure .env.production with your values"
echo "   5. Setup Node.js app in cPanel (see CPANEL_DEPLOYMENT.md)"
echo ""
echo "✨ Ready for deployment!"
