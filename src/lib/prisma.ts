import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with connection pooling optimized for serverless
export const prisma = 
  globalForPrisma.prisma ?? 
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Helper function to safely disconnect
export async function disconnectPrisma() {
  try {
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error disconnecting Prisma:', error)
  }
}

// Graceful shutdown handlers
if (typeof window === 'undefined') {
  process.on('beforeExit', disconnectPrisma)
  process.on('SIGINT', disconnectPrisma)
  process.on('SIGTERM', disconnectPrisma)
}