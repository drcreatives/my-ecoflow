/**
 * Environment Variables Validation
 * This file checks that all required environment variables are properly set
 */

interface EnvironmentVariables {
  // EcoFlow API Configuration
  ECOFLOW_ACCESS_KEY: string
  ECOFLOW_SECRET_KEY: string
  
  // Supabase Configuration
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  
  // Database Configuration
  DATABASE_URL: string
  
  // Optional: NextAuth Configuration
  NEXTAUTH_SECRET?: string
  NEXTAUTH_URL?: string
}

export function validateEnvironmentVariables(): { isValid: boolean; missingVars: string[]; warnings: string[] } {
  const required: (keyof EnvironmentVariables)[] = [
    'ECOFLOW_ACCESS_KEY',
    'ECOFLOW_SECRET_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'DATABASE_URL'
  ]
  
  const optional: (keyof EnvironmentVariables)[] = [
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL'
  ]
  
  const missingVars: string[] = []
  const warnings: string[] = []
  
  // Check required variables
  for (const variable of required) {
    const value = process.env[variable]
    if (!value || value.includes('[YOUR-') || value.includes('your_') || value.includes('generate_a_random')) {
      missingVars.push(variable)
    }
  }
  
  // Check optional variables and provide warnings
  for (const variable of optional) {
    const value = process.env[variable]
    if (!value || value.includes('[YOUR-') || value.includes('your_') || value.includes('generate_a_random')) {
      warnings.push(`Optional variable ${variable} is not configured`)
    }
  }
  
  // Specific validations
  if (process.env.DATABASE_URL?.includes('[YOUR-PASSWORD]')) {
    warnings.push('DATABASE_URL contains placeholder password - you need to replace [YOUR-PASSWORD] with your actual Supabase database password')
  }
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('supabase.co')) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL does not appear to be a valid Supabase URL')
  }
  
  return {
    isValid: missingVars.length === 0,
    missingVars,
    warnings
  }
}

export function logEnvironmentStatus(): void {
  const { isValid, missingVars, warnings } = validateEnvironmentVariables()
  
  console.log('🔧 Environment Variables Status:')
  
  if (isValid) {
    console.log('✅ All required environment variables are configured')
  } else {
    console.log('❌ Missing required environment variables:')
    missingVars.forEach(variable => {
      console.log(`   - ${variable}`)
    })
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:')
    warnings.forEach(warning => {
      console.log(`   - ${warning}`)
    })
  }
  
  console.log('\n📋 Required Environment Variables:')
  console.log('   - ECOFLOW_ACCESS_KEY: Your EcoFlow API access key')
  console.log('   - ECOFLOW_SECRET_KEY: Your EcoFlow API secret key')
  console.log('   - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL')
  console.log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY: Your Supabase anonymous key')
  console.log('   - DATABASE_URL: Your Supabase PostgreSQL connection string')
  
  console.log('\n🔗 Where to find these values:')
  console.log('   EcoFlow API: https://developer-eu.ecoflow.com/')
  console.log('   Supabase: Your project dashboard → Settings → API')
  console.log('   Database URL: Your project dashboard → Settings → Database')
}