import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware stub — auth is now handled client-side by AuthWrapper (Convex Auth).
 * This file is kept as a no-op so Next.js doesn't fall back to default behavior.
 * The Supabase session refresh that used to live here is no longer needed.
 */
export async function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}