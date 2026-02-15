#!/bin/bash

# MySQL Migration Script
# This script helps migrate from PostgreSQL to MySQL

echo "========================================="
echo "EcoFlow Dashboard - MySQL Migration"
echo "========================================="
echo ""

# Step 1: Backup current Prisma schema
echo "Step 1: Backing up current Prisma schema..."
if [ -f "prisma/schema.prisma" ]; then
    cp prisma/schema.prisma prisma/schema.postgres.backup
    echo "✅ Backup created: prisma/schema.postgres.backup"
else
    echo "⚠️  No existing schema found"
fi

# Step 2: Replace schema with MySQL version
echo ""
echo "Step 2: Switching to MySQL schema..."
if [ -f "prisma/schema.mysql.prisma" ]; then
    cp prisma/schema.mysql.prisma prisma/schema.prisma
    echo "✅ MySQL schema activated"
else
    echo "❌ MySQL schema file not found!"
    exit 1
fi

# Step 3: Update dependencies
echo ""
echo "Step 3: Updating Prisma dependencies..."
npm install @prisma/client@latest
npm install -D prisma@latest

if [ $? -ne 0 ]; then
    echo "❌ Failed to update dependencies"
    exit 1
fi

echo "✅ Dependencies updated"

# Step 4: Generate Prisma Client
echo ""
echo "Step 4: Generating Prisma Client for MySQL..."
npx prisma generate

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate Prisma Client"
    exit 1
fi

echo "✅ Prisma Client generated"

# Step 5: Instructions for database setup
echo ""
echo "========================================="
echo "Next Steps - Manual Action Required:"
echo "========================================="
echo ""
echo "1. Create MySQL database in cPanel:"
echo "   - Database name: ecoflow_dashboard"
echo "   - Create user with ALL PRIVILEGES"
echo ""
echo "2. Update your .env.local with MySQL connection:"
echo "   DATABASE_URL=\"mysql://user:password@host:3306/database\""
echo ""
echo "3. Push schema to MySQL database:"
echo "   npx prisma db push"
echo ""
echo "4. Verify tables in phpMyAdmin"
echo ""
echo "5. (Optional) Migrate data from PostgreSQL:"
echo "   - Export data from Supabase"
echo "   - Import to MySQL via phpMyAdmin"
echo ""
echo "6. Update Vercel environment variables:"
echo "   - Add new DATABASE_URL with MySQL connection"
echo ""
echo "7. Test the application locally:"
echo "   npm run dev"
echo ""
echo "========================================="
echo "Migration preparation complete!"
echo "========================================="
