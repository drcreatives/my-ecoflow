# Database Migration Guide

## Step 1: Create New Supabase Project
1. Go to https://supabase.com/dashboard
2. Create new project: `my-ecoflow-db`
3. Save the database password!

## Step 2: Get New Connection Details
From your new Supabase project → Settings → Database:

```bash
# New environment variables (update these with your actual values)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_NEW_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_NEW_ANON_KEY
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_NEW_PROJECT_ID.supabase.co:5432/postgres
```

## Step 3: Update Local Environment
Update your `.env.local` file with the new values.

## Step 4: Run Database Migration
```bash
# Reset and push the schema to new database
npx prisma db push --force-reset

# Or if you want to keep data, generate and run migration
npx prisma migrate dev --name init
```

## Step 5: Update Vercel Environment Variables
Go to Vercel → Project → Settings → Environment Variables and update:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY  
- DATABASE_URL

## Step 6: Test the Connection
```bash
# Test locally
curl "http://localhost:3000/api/test-db-connection"

# Test on Vercel (after deployment)
curl "https://my-ecoflow.vercel.app/api/test-db-connection"
```

## Backup Current Data (Optional)
If you have important data in the current database and it's accessible:

```bash
# Export current data
npx prisma db seed  # if you have a seed file
# or manually export from Supabase dashboard
```