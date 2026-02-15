#!/bin/bash

# cPanel PostgreSQL Migration Script
# This script helps migrate from Supabase PostgreSQL to cPanel PostgreSQL

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   cPanel PostgreSQL Migration Script                      ║"
echo "║   From: Supabase PostgreSQL                               ║"
echo "║   To: cPanel PostgreSQL (devrunor_ prefix)                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Backup current .env.local
echo -e "${YELLOW}📦 Creating backup of .env.local...${NC}"
if [ -f .env.local ]; then
    cp .env.local .env.local.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✅ Backup created${NC}"
else
    echo -e "${YELLOW}⚠️  No .env.local found, will create new one${NC}"
fi
echo ""

# Get cPanel PostgreSQL credentials
echo -e "${YELLOW}🔑 Please enter your cPanel PostgreSQL credentials:${NC}"
echo ""

read -p "cPanel Host (e.g., server123.hostgator.com): " CPANEL_HOST
read -p "Database Password for devrunor_ecoflow_user: " -s DB_PASSWORD
echo ""
echo ""

# Build connection string
DATABASE_URL="postgresql://devrunor_ecoflow_user:${DB_PASSWORD}@${CPANEL_HOST}:5432/devrunor_ecoflow_dashboard?sslmode=prefer"

echo -e "${YELLOW}📝 Updating .env.local...${NC}"

# Create or update .env.local
if [ -f .env.local ]; then
    # Update existing DATABASE_URL
    if grep -q "^DATABASE_URL=" .env.local; then
        # Backup line
        TEMP_FILE=$(mktemp)
        grep "^DATABASE_URL=" .env.local > .env.local.old_db_url
        # Replace DATABASE_URL line
        sed "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|g" .env.local > "$TEMP_FILE"
        mv "$TEMP_FILE" .env.local
        echo -e "${GREEN}✅ Updated existing DATABASE_URL${NC}"
    else
        # Append DATABASE_URL
        echo "" >> .env.local
        echo "# cPanel PostgreSQL Database" >> .env.local
        echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env.local
        echo -e "${GREEN}✅ Added DATABASE_URL to .env.local${NC}"
    fi
else
    # Create new .env.local
    cat > .env.local << EOF
# cPanel PostgreSQL Database
DATABASE_URL="${DATABASE_URL}"

# Copy other environment variables from Supabase setup
# NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
# ECOFLOW_ACCESS_KEY=your_access_key
# ECOFLOW_SECRET_KEY=your_secret_key
EOF
    echo -e "${GREEN}✅ Created new .env.local${NC}"
fi
echo ""

# Show connection info (masked password)
MASKED_URL=$(echo "$DATABASE_URL" | sed "s/:${DB_PASSWORD}@/:****@/g")
echo -e "${GREEN}🔗 Connection String:${NC}"
echo "$MASKED_URL"
echo ""

# Generate Prisma Client
echo -e "${YELLOW}🔧 Generating Prisma Client...${NC}"
if npx prisma generate; then
    echo -e "${GREEN}✅ Prisma Client generated${NC}"
else
    echo -e "${RED}❌ Prisma generate failed${NC}"
    exit 1
fi
echo ""

# Push schema to database
echo -e "${YELLOW}📤 Pushing schema to cPanel PostgreSQL...${NC}"
echo "This will create all tables in devrunor_ecoflow_dashboard"
echo ""
read -p "Continue? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if npx prisma db push; then
        echo -e "${GREEN}✅ Schema pushed successfully${NC}"
    else
        echo -e "${RED}❌ Schema push failed${NC}"
        echo -e "${YELLOW}Check the error above and verify:${NC}"
        echo "  - Database exists: devrunor_ecoflow_dashboard"
        echo "  - User has privileges: devrunor_ecoflow_user"
        echo "  - Connection string is correct"
        echo "  - Remote access is enabled in cPanel"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Skipped schema push${NC}"
fi
echo ""

# Test connection
echo -e "${YELLOW}🧪 Testing database connection...${NC}"
if npx tsx -e "import { Pool } from 'pg'; const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT NOW() as now, version() as version').then(r => { console.log('✅ Connected!'); console.log('Time:', r.rows[0].now); console.log('Version:', r.rows[0].version.split(' ')[0] + ' ' + r.rows[0].version.split(' ')[1]); process.exit(0); }).catch(e => { console.error('❌ Connection failed:', e.message); process.exit(1); })"; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    echo -e "${YELLOW}Please check your credentials and try again${NC}"
    exit 1
fi
echo ""

# Summary
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Migration Complete! 🎉                                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. Test locally:"
echo "   npm run dev"
echo ""
echo "2. Verify in phpPgAdmin:"
echo "   cPanel → phpPgAdmin → devrunor_ecoflow_dashboard"
echo ""
echo "3. Update Vercel Environment Variables:"
echo "   Vercel Dashboard → Settings → Environment Variables"
echo "   Update DATABASE_URL with:"
echo "   $MASKED_URL"
echo ""
echo "4. Deploy to Vercel:"
echo "   git add .env.local.backup.*"
echo "   git commit -m 'Migrate to cPanel PostgreSQL'"
echo "   git push"
echo ""
echo -e "${GREEN}✅ Local development is now using cPanel PostgreSQL!${NC}"
echo ""
echo -e "${YELLOW}⚠️  Remember:${NC}"
echo "  - Your .env.local backup is saved"
echo "  - Don't commit .env.local to git"
echo "  - Update Vercel environment variables"
echo "  - Test thoroughly before going live"
echo ""
