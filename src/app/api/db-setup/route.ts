import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting database table creation...')
    
    // Connect to database
    await prisma.$connect()
    console.log('✅ Connected to database')
    
    // Create tables manually using raw SQL based on our Prisma schema
    const createTablesSQL = `
      -- Create users table
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "password_hash" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      );

      -- Create unique index on email
      CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

      -- Create devices table
      CREATE TABLE IF NOT EXISTS "Device" (
        "id" TEXT NOT NULL,
        "device_sn" TEXT NOT NULL,
        "device_name" TEXT NOT NULL,
        "device_type" TEXT NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "user_id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
      );

      -- Create unique index on device_sn
      CREATE UNIQUE INDEX IF NOT EXISTS "Device_device_sn_key" ON "Device"("device_sn");

      -- Create device_readings table
      CREATE TABLE IF NOT EXISTS "DeviceReading" (
        "id" TEXT NOT NULL,
        "device_id" TEXT NOT NULL,
        "battery_level" INTEGER NOT NULL,
        "input_watts" DECIMAL(10,2) NOT NULL,
        "output_watts" DECIMAL(10,2) NOT NULL,
        "temperature" DECIMAL(5,2),
        "status" TEXT NOT NULL,
        "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DeviceReading_pkey" PRIMARY KEY ("id")
      );

      -- Create index for performance
      CREATE INDEX IF NOT EXISTS "DeviceReading_device_id_recorded_at_idx" ON "DeviceReading"("device_id", "recorded_at" DESC);

      -- Create device_alerts table
      CREATE TABLE IF NOT EXISTS "DeviceAlert" (
        "id" TEXT NOT NULL,
        "device_id" TEXT NOT NULL,
        "alert_type" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "is_read" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DeviceAlert_pkey" PRIMARY KEY ("id")
      );

      -- Create foreign key constraints
      ALTER TABLE "Device" DROP CONSTRAINT IF EXISTS "Device_user_id_fkey";
      ALTER TABLE "Device" ADD CONSTRAINT "Device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      
      ALTER TABLE "DeviceReading" DROP CONSTRAINT IF EXISTS "DeviceReading_device_id_fkey";
      ALTER TABLE "DeviceReading" ADD CONSTRAINT "DeviceReading_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      
      ALTER TABLE "DeviceAlert" DROP CONSTRAINT IF EXISTS "DeviceAlert_device_id_fkey";
      ALTER TABLE "DeviceAlert" ADD CONSTRAINT "DeviceAlert_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    `

    // Execute the SQL to create tables
    const sqlCommands = createTablesSQL.split(';').filter(cmd => cmd.trim())
    
    for (const command of sqlCommands) {
      if (command.trim()) {
        try {
          await prisma.$executeRawUnsafe(command.trim())
          console.log('✅ Executed:', command.trim().split('\n')[0])
        } catch (error) {
          console.log('ℹ️ Command skipped (may already exist):', command.trim().split('\n')[0])
        }
      }
    }

    // Verify tables were created
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `

    console.log('📋 Tables created:', tables)

    return NextResponse.json({
      success: true,
      message: 'Database tables created successfully',
      tables: tables,
      timestamp: new Date().toISOString(),
      nextSteps: [
        'Tables created in Supabase database',
        'Next: Set up Supabase authentication policies',
        'Then: Test authenticated API endpoints'
      ]
    })

  } catch (error) {
    console.error('❌ Database setup failed:', error)
    
    return NextResponse.json(
      { 
        error: 'Database setup failed',
        message: error instanceof Error ? error.message : 'Unknown database error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET(request: NextRequest) {
  try {
    await prisma.$connect()
    
    // Check what tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `

    return NextResponse.json({
      success: true,
      message: 'Database schema check',
      tables: tables,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Schema check failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}