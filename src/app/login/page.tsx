'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Eye, EyeOff, Power, Zap, Lock, Mail, User, ArrowRight } from 'lucide-react'

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
  const supabase = createClient()

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      }
    }
    checkUser()
  }, [router, supabase.auth])

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
      if (isLogin) {
        // Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        })

        if (error) {
          setErrors({ general: error.message })
        } else if (data.session) {
          router.push('/dashboard')
        }
      } else {
        // Signup
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password
        })

        if (error) {
          setErrors({ general: error.message })
        } else if (data.user) {
          setErrors({ 
            general: 'Check your email for a confirmation link to complete registration!' 
          })
        }
      }
    } catch (error) {
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
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
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-green-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo/Brand Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-green-400 rounded-xl mb-4">
            <Power className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            EcoFlow Dashboard
          </h1>
          <p className="text-gray-400">
            Monitor and control your EcoFlow devices
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-8 shadow-2xl">
          {/* Mode Toggle */}
          <div className="flex bg-gray-800/50 rounded-lg p-1 mb-8">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                isLogin 
                  ? 'bg-green-500 text-black shadow-lg' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                !isLogin 
                  ? 'bg-green-500 text-black shadow-lg' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full h-12 pl-12 pr-4 py-3 bg-gray-800/50 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                    errors.email 
                      ? 'border-red-500 focus:ring-red-500/20' 
                      : 'border-gray-700 focus:border-green-500 focus:ring-green-500/20'
                  }`}
                  placeholder="Enter your email"
                />
              </div>
              {errors.email && (
                <p className="mt-2 text-sm text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={`w-full h-12 pl-12 pr-12 py-3 bg-gray-800/50 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                    errors.password 
                      ? 'border-red-500 focus:ring-red-500/20' 
                      : 'border-gray-700 focus:border-green-500 focus:ring-green-500/20'
                  }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors z-10"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-2 text-sm text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password Field (Signup only) */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword || ''}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className={`w-full h-12 pl-12 pr-12 py-3 bg-gray-800/50 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                      errors.confirmPassword 
                        ? 'border-red-500 focus:ring-red-500/20' 
                        : 'border-gray-700 focus:border-green-500 focus:ring-green-500/20'
                    }`}
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors z-10"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-2 text-sm text-red-400">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            {/* General Error */}
            {errors.general && (
              <div className={`p-4 rounded-lg ${
                errors.general.includes('Check your email') 
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                <p className="text-sm">{errors.general}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-gradient-to-r from-green-500 to-green-400 hover:from-green-600 hover:to-green-500 text-black font-medium px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center group"
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
          <div className="mt-8 pt-6 border-t border-gray-800">
            <p className="text-center text-gray-400 text-sm">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={toggleMode}
                className="text-green-400 hover:text-green-300 font-medium transition-colors"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Quick Test Links */}
        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm mb-4">Development Tools</p>
          <div className="flex space-x-4 justify-center">
            <a 
              href="/api/test-ecoflow" 
              target="_blank"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Test API
            </a>
            <a 
              href="/" 
              className="text-gray-400 hover:text-gray-300 text-sm transition-colors"
            >
              Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}