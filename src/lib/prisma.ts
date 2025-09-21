import { PrismaClient } from '@prisma/client'

// Create a function that returns a completely isolated Prisma client
export function createIsolatedPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        // Force direct connection with unique connection parameters to avoid conflicts
        url: process.env.DATABASE_URL?.includes('pgbouncer') 
          ? process.env.DATABASE_URL.replace('pgbouncer=true', 'pgbouncer=false').replace(/aws-.*pooler/, 'db') 
          : process.env.DATABASE_URL
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