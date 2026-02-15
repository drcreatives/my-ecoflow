# cPanel Deployment Guide for EcoFlow Dashboard

## Prerequisites
- cPanel account with Node.js support (version 18.x or higher)
- SSH access to your server
- Domain or subdomain configured

## Build Steps

### 1. Build the Production Bundle

```bash
# Install dependencies
npm install

# Create production build
npm run build
```

This will create:
- `.next/standalone` - Self-contained server
- `.next/static` - Static assets
- `public` - Public assets

### 2. Prepare Deployment Package

After building, you need to upload these folders to cPanel:

```
my-ecoflow/
├── .next/
│   ├── standalone/     ← Upload this entire folder
│   └── static/         ← Upload to .next/static on server
├── public/             ← Upload to public/ on server
└── .env.production     ← Upload with production environment variables
```

## cPanel Deployment Instructions

### Option A: Using File Manager (Easy)

1. **Build the project locally**
   ```bash
   npm run build
   ```

2. **Create deployment package**
   - Compress `.next/standalone` folder → `standalone.zip`
   - Compress `.next/static` folder → `static.zip`
   - Compress `public` folder → `public.zip`

3. **Upload to cPanel**
   - Login to cPanel File Manager
   - Navigate to your domain folder (e.g., `public_html/ecoflow`)
   - Upload and extract `standalone.zip`
   - Create `.next` folder if it doesn't exist
   - Inside `.next`, upload and extract `static.zip`
   - Upload and extract `public.zip`

4. **Setup Environment Variables**
   - Create `.env.production` file in the root directory
   - Copy all variables from `.env.local`:
     ```env
     # Database
     DATABASE_URL=your_production_database_url
     
     # Supabase
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     
     # EcoFlow API
     ECOFLOW_ACCESS_KEY=your_access_key
     ECOFLOW_SECRET_KEY=your_secret_key
     
     # App Config
     NEXT_PUBLIC_APP_URL=https://yourdomain.com
     NODE_ENV=production
     ```

5. **Setup Node.js Application in cPanel**
   - Go to **Setup Node.js App** in cPanel
   - Click **Create Application**
   - Configure:
     - Node.js version: 18.x or higher
     - Application mode: Production
     - Application root: `/home/username/public_html/ecoflow`
     - Application URL: `ecoflow.yourdomain.com` or subdirectory
     - Application startup file: `server.js`
     - Environment variables: Add from `.env.production`
   - Click **Create**

6. **Start the Application**
   - Click **Run NPM Install** (if needed)
   - Click **Restart** to start the server

### Option B: Using SSH (Advanced)

1. **Connect via SSH**
   ```bash
   ssh username@yourdomain.com
   ```

2. **Navigate to deployment directory**
   ```bash
   cd public_html/ecoflow
   ```

3. **Upload files** (use SCP, SFTP, or Git)
   ```bash
   # From your local machine
   scp -r .next/standalone/* username@yourdomain.com:~/public_html/ecoflow/
   scp -r .next/static username@yourdomain.com:~/public_html/ecoflow/.next/
   scp -r public username@yourdomain.com:~/public_html/ecoflow/
   ```

4. **Setup environment variables**
   ```bash
   nano .env.production
   # Paste your production environment variables
   ```

5. **Start the server**
   ```bash
   NODE_ENV=production node server.js
   ```

## Folder Structure on Server

Your cPanel directory should look like this:

```
/home/username/public_html/ecoflow/
├── .next/
│   ├── static/
│   │   ├── chunks/
│   │   ├── css/
│   │   └── media/
│   └── ...
├── public/
│   ├── file.svg
│   ├── globe.svg
│   └── ...
├── node_modules/
├── package.json
├── server.js
├── .env.production
└── ... (other standalone files)
```

## Port Configuration

By default, Next.js runs on port 3000. In cPanel:
- The Node.js app manager will assign a port
- cPanel's Apache/nginx proxy will route your domain to that port
- No manual port configuration needed

## Troubleshooting

### Application Won't Start
1. Check Node.js version: `node --version` (should be 18+)
2. Verify environment variables are set
3. Check error logs in cPanel → Setup Node.js App → Your App → Logs

### 404 Errors on Routes
1. Ensure `.next/static` is in the correct location
2. Verify `public` folder is uploaded
3. Check Application URL in cPanel matches your domain

### Database Connection Errors
1. Verify DATABASE_URL is correct for production
2. Check if your database allows connections from cPanel server IP
3. Test database connection from cPanel terminal

### API Routes Not Working
1. Verify all environment variables are set
2. Check server.js is the startup file
3. Review application logs for errors

## Environment Variables Checklist

Make sure these are set in cPanel Node.js App or `.env.production`:

- [ ] `DATABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ECOFLOW_ACCESS_KEY`
- [ ] `ECOFLOW_SECRET_KEY`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NODE_ENV=production`

## Post-Deployment

1. **Test the application**
   - Visit your domain
   - Test login/signup
   - Test device management
   - Check API endpoints

2. **Setup SSL Certificate**
   - In cPanel → SSL/TLS → Install SSL
   - Use Let's Encrypt for free SSL

3. **Monitor Logs**
   - Check application logs regularly
   - Setup error monitoring if available

## Updates and Redeployment

When you need to update the app:

1. Build new version locally: `npm run build`
2. Upload only changed files
3. Restart Node.js app in cPanel
4. Clear browser cache if needed

## Support

If you encounter issues:
1. Check cPanel error logs
2. Verify all files uploaded correctly
3. Ensure Node.js version compatibility
4. Contact your hosting provider for Node.js app support
