import { Pool, PoolClient } from 'pg'

// Create a connection pool for PostgreSQL
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    // For both local and production, disable SSL rejection for Supabase
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    
    // Parse the DATABASE_URL to extract connection details
    const dbUrl = process.env.DATABASE_URL || ''
    
    // Create pool with direct connection (no prepared statements)
    pool = new Pool({
      connectionString: dbUrl,
      // SSL configuration for Supabase (both local and production)
      ssl: {
        rejectUnauthorized: false
      },
      // Disable prepared statements completely
      statement_timeout: 30000,
      query_timeout: 30000,
      // Connection pool settings for serverless
      max: 1, // Single connection for serverless
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 10000,
      // Force new connections to avoid conflicts
      allowExitOnIdle: true
    })
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err)
    })
  }
  
  return pool
}

// Execute a query with automatic connection management
export async function executeQuery<T = any>(
  text: string, 
  params?: any[]
): Promise<T[]> {
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    // Use simple query protocol to avoid prepared statements
    const result = await client.query({
      text,
      values: params,
      // Force simple query protocol (no prepared statements)
      name: undefined
    })
    
    return result.rows as T[]
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  } finally {
    client.release()
  }
}

// Execute a single query and return first row
export async function executeQuerySingle<T = any>(
  text: string, 
  params?: any[]
): Promise<T | null> {
  const rows = await executeQuery<T>(text, params)
  return rows.length > 0 ? rows[0] : null
}

// Execute multiple queries in a transaction
export async function executeTransaction<T>(
  operations: ((client: PoolClient) => Promise<T>)
): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    
    const result = await operations(client)
    
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Clean up the pool (for graceful shutdown)
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}