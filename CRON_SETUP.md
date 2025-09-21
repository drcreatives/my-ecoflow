# Cron Job Setup for EcoFlow Dashboard

This application uses Vercel Cron Jobs to automatically collect device readings every minute for reliable analytics and historical data.

## Required Environment Variable

Add this to your Vercel environment variables:

```
CRON_SECRET=your-secure-random-string-here
```

**Generate a secure random string:**
```bash
# Option 1: Using Node.js crypto
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 32

# Option 3: Manual secure string (32+ characters)
```

## How It Works

1. **Vercel Cron Job** runs every minute (`* * * * *`)
2. **Endpoint**: `/api/cron/collect-readings`
3. **Authentication**: Uses `CRON_SECRET` for security
4. **Process**: 
   - Fetches all devices from database
   - Collects current readings from EcoFlow API
   - Stores readings with timestamp
   - Cleans up old readings (>30 days)

## Deployment Steps

1. **Add environment variable** in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add `CRON_SECRET` with your generated value

2. **Deploy the application** - the `vercel.json` configuration will automatically set up the cron job

3. **Monitor status** - Check the dashboard for the "Auto Collection" widget

## Testing

Test the cron job locally:
```bash
# Set CRON_SECRET in your .env.local
CRON_SECRET=your-test-secret

# Test the endpoint
curl -H "Authorization: Bearer your-test-secret" http://localhost:3000/api/cron/collect-readings
```

## Monitoring

- **Dashboard Widget**: Shows collection status and reading count
- **Monitor Endpoint**: `/api/monitor-readings` - Shows recent readings
- **Test Endpoint**: `/api/test-cron` - Verifies cron setup

## Data Retention

- Readings older than 30 days are automatically cleaned up
- Adjust retention period in `/api/cron/collect-readings/route.ts` if needed

## Troubleshooting

1. **Cron not running**: Check Vercel function logs
2. **Authentication errors**: Verify `CRON_SECRET` matches
3. **API quota**: Monitor EcoFlow API rate limits
4. **Database issues**: Check Supabase connection and storage limits