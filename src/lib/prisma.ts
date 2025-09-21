import { PrismaClient } from '@prisma/client'

// Create a function that returns a completely isolated Prisma client
export function createIsolatedPrismaClient() {
  // Build URL with direct connection (no pgbouncer) and unique session parameters
  let dbUrl = process.env.DATABASE_URL || ''
  
  // Remove pgbouncer if present - use direct connection
  if (dbUrl.includes('pgbouncer')) {
    dbUrl = dbUrl.replace('pgbouncer=true', 'pgbouncer=false').replace(/aws-.*pooler/, 'db')
  }
  
  // Create completely unique connection to avoid any conflicts
  const urlObj = new URL(dbUrl)
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`
  
  // Add unique session parameters
  urlObj.searchParams.set('application_name', `ecoflow_${uniqueId}`)
  urlObj.searchParams.set('connect_timeout', '10')
  urlObj.searchParams.set('statement_timeout', '30000')
  
  // Create client with aggressive isolation settings
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: urlObj.toString()
      }
    }
  })
  
  // Force immediate connection to prevent lazy loading conflicts
  client.$connect().catch(() => {
    // Ignore connection errors during initialization
  })
  
  return client
}

// For backward compatibility in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createIsolatedPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Helper function to execute a query with complete isolation
export async function withPrisma<T>(
  operation: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const client = createIsolatedPrismaClient()
  try {
    // Ensure client is connected before operation
    await client.$connect()
    
    // Add small delay to prevent race conditions in serverless
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
    
    const result = await operation(client)
    return result
  } finally {
    // Force immediate disconnection
    try {
      await client.$disconnect()
    } catch (error) {
      console.error('Error disconnecting Prisma:', error)
    }
  }
}

// Legacy function for backward compatibility
export function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return createIsolatedPrismaClient()
  }
  return prisma
}

// Helper function to safely disconnect
export async function disconnectPrisma(client: PrismaClient) {
  try {
    await client.$disconnect()
  } catch (error) {
    console.error('Error disconnecting Prisma:', error)
  }
}