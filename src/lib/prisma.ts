import { PrismaClient } from '@prisma/client'

// Create a function that returns a new Prisma client for each request
export function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        // Use direct connection for serverless to avoid prepared statement conflicts
        url: process.env.DATABASE_URL?.replace('pgbouncer=true', 'pgbouncer=false')
      }
    }
  })
}

// For backward compatibility, export a singleton for non-critical operations
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Helper function to get a fresh Prisma client for serverless functions
export function getPrismaClient(): PrismaClient {
  // In production, always create new instance to avoid connection conflicts
  if (process.env.NODE_ENV === 'production') {
    return createPrismaClient()
  }
  // In development, use singleton
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