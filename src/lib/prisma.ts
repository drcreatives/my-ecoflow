import { PrismaClient } from '@prisma/client'

// Create a function that returns a completely isolated Prisma client
export function createIsolatedPrismaClient() {
  // Build URL with parameters to disable prepared statements
  let dbUrl = process.env.DATABASE_URL || ''
  
  // Remove pgbouncer if present and add prepared statement disabling parameters
  if (dbUrl.includes('pgbouncer')) {
    dbUrl = dbUrl.replace('pgbouncer=true', 'pgbouncer=false').replace(/aws-.*pooler/, 'db')
  }
  
  // Add parameters to disable prepared statements and avoid naming conflicts
  const urlObj = new URL(dbUrl)
  urlObj.searchParams.set('prepared_statement_cache_queries', 'false')
  urlObj.searchParams.set('statement_cache_size', '0')
  urlObj.searchParams.set('connection_limit', '1')
  // Add unique session identifier to prevent statement name conflicts
  urlObj.searchParams.set('application_name', `prisma_${Date.now()}_${Math.random().toString(36).substring(7)}`)
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: urlObj.toString()
      }
    }
  })
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
    const result = await operation(client)
    return result
  } finally {
    await client.$disconnect()
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