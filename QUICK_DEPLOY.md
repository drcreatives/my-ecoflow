# Quick cPanel Deployment Guide

## Simple 3-Step Deployment

### Step 1: Build the Production Package

Run this command in your terminal:

```bash
npm run build
```

This creates a `.next` folder with your production build.

### Step 2: Create Deployment ZIP

Manually create a ZIP file containing these folders/files:

```
ecoflow-cpanel.zip
├── .next/
│   ├── standalone/  (entire folder)
│   └── static/      (entire folder)
├── public/          (entire folder)
└── .env.production  (create this file - see below)
```

### Step 3: Upload to cPanel

1. **Upload ZIP to cPanel**
   - Login to cPanel File Manager
   - Navigate to your folder (e.g., `public_html/ecoflow`)
   - Upload `ecoflow-cpanel.zip`
   - Extract the ZIP file

2. **Create .env.production file** in the extracted folder:
   ```env
   DATABASE_URL=your_database_url
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   ECOFLOW_ACCESS_KEY=your_access_key
   ECOFLOW_SECRET_KEY=your_secret_key
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   NODE_ENV=production
   ```

3. **Setup Node.js Application in cPanel**
   - Go to "Setup Node.js App"
   - Click "Create Application"
   - Set:
     - Node.js version: 18 or higher
     - Application mode: Production
     - Application root: `/home/username/public_html/ecoflow`  
     - Application startup file: `server.js`
   - Click "Create"
   - Click "Restart"

4. **Access your application** at your configured domain/subdomain

## File Structure After Upload

Your cPanel directory should look like:

```
/home/username/public_html/ecoflow/
├── .next/
│   ├── static/
│   └── (other standalone files from .next/standalone/)
├── public/
├── server.js
├── package.json
└── .env.production
```

## Important Notes

- ✅ The `.next/standalone` folder contents go in the ROOT (not in a subfolder)
- ✅ The `.next/static` folder goes inside `.next/` folder
- ✅ Make sure `server.js` is in the root directory
- ✅ Set all environment variables
- ✅ Use Node.js 18 or higher

## Troubleshooting

**App won't start?**
- Check Node.js version is 18+
- Verify `.env.production` has all variables
- Check logs in cPanel → Node.js App → Your App → Error Log

**Routes not working?**
- Ensure `.next/static` is in the right location
- Restart the Node.js application

**Database errors?**
- Verify DATABASE_URL is correct
- Check if database allows connections from your cPanel server IP

## Need Help?

See the full guide: `CPANEL_DEPLOYMENT.md`
