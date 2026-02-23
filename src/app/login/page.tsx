'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth } from 'convex/react'
import { Eye, EyeOff, Power, Zap, Lock, Mail, ArrowRight } from 'lucide-react'

interface FormData {
  email: string
  password: string
  confirmPassword?: string
}

interface FormErrors {
  email?: string
  password?: string
  confirmPassword?: string
  general?: string
}

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const router = useRouter()
  const { signIn } = useAuthActions()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, authLoading, router])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Email validation
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    // Confirm password validation (for signup)
    if (!isLogin) {
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password'
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsLoading(true)
    setErrors({})

    try {
      const formDataObj = new FormData()
      formDataObj.set('email', formData.email)
      formDataObj.set('password', formData.password)
      formDataObj.set('flow', isLogin ? 'signIn' : 'signUp')

      await signIn('password', formDataObj)
      router.push('/dashboard')
    } catch (err) {
      console.error('Auth error:', err)
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      if (message.includes('Could not find') || message.includes('Invalid')) {
        setErrors({ general: 'Invalid email or password. Please try again.' })
      } else if (message.includes('already exists') || message.includes('duplicate')) {
        setErrors({ general: 'An account with this email already exists. Try signing in.' })
      } else {
        setErrors({ general: message })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setFormData({ email: '', password: '', confirmPassword: '' })
    setErrors({})
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-tertiary/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo/Brand Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-brand-primary rounded-card mb-3 sm:mb-4">
            <Power className="w-7 h-7 sm:w-8 sm:h-8 text-bg-base" />
          </div>
          <h1 className="text-page-title font-medium text-text-primary mb-2">
            EcoFlow Dashboard
          </h1>
          <p className="text-text-muted text-sm sm:text-base">
            Monitor and control your EcoFlow devices
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6 sm:p-8">
          {/* Mode Toggle */}
          <div className="flex bg-surface-2 rounded-inner p-1 mb-6 sm:mb-8">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-inner text-sm font-medium transition-all duration-160 ease-dashboard touch-manipulation ${
                isLogin 
                  ? 'bg-brand-primary text-bg-base' 
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-inner text-sm font-medium transition-all duration-160 ease-dashboard touch-manipulation ${
                !isLogin 
                  ? 'bg-brand-primary text-bg-base' 
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted z-10" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full h-12 sm:h-14 pl-12 pr-4 py-3 bg-surface-2 border rounded-inner text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-all text-base ${
                    errors.email 
                      ? 'border-danger focus:ring-danger/20' 
                      : 'border-stroke-subtle focus:border-brand-primary focus:ring-brand-primary/20'
                  }`}
                  placeholder="Enter your email"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              {errors.email && (
                <p className="mt-2 text-sm text-danger">{errors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted z-10" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={`w-full h-12 sm:h-14 pl-12 pr-12 py-3 bg-surface-2 border rounded-inner text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-all text-base ${
                    errors.password 
                      ? 'border-danger focus:ring-danger/20' 
                      : 'border-stroke-subtle focus:border-brand-primary focus:ring-brand-primary/20'
                  }`}
                  placeholder="Enter your password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors z-10 touch-manipulation p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-2 text-sm text-danger">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password Field (Signup only) */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted z-10" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword || ''}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className={`w-full h-12 sm:h-14 pl-12 pr-12 py-3 bg-surface-2 border rounded-inner text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-all text-base ${
                      errors.confirmPassword 
                        ? 'border-danger focus:ring-danger/20' 
                        : 'border-stroke-subtle focus:border-brand-primary focus:ring-brand-primary/20'
                    }`}
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors z-10 touch-manipulation p-1"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-2 text-sm text-danger">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            {/* General Error */}
            {errors.general && (
              <div className={`p-3 sm:p-4 rounded-inner ${
                errors.general.includes('Check your email') 
                  ? 'bg-brand-primary/10 border border-brand-primary/20 text-brand-primary'
                  : 'bg-danger/10 border border-danger/20 text-danger'
              }`}>
                <p className="text-sm">{errors.general}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 sm:h-14 bg-brand-primary hover:bg-brand-primary/90 text-bg-base font-medium px-4 rounded-pill transition-all duration-160 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center group touch-manipulation text-base"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <Zap className="w-5 h-5 mr-2 animate-pulse" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </div>
              ) : (
                <div className="flex items-center">
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-stroke-subtle">
            <p className="text-center text-text-muted text-sm">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={toggleMode}
                className="text-brand-primary hover:text-brand-primary/80 font-medium transition-colors"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Quick Test Links */}
        <div className="mt-8 text-center">
          <p className="text-text-muted text-sm mb-4">Development Tools</p>
          <div className="flex space-x-4 justify-center">
            <a 
              href="/api/test-ecoflow" 
              target="_blank"
              className="text-brand-tertiary hover:text-brand-tertiary/80 text-sm transition-colors"
            >
              Test API
            </a>
            <Link 
              href="/" 
              className="text-text-muted hover:text-text-secondary text-sm transition-colors"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}