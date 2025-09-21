import { create } from 'zustand'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void
  setUser: (user: User | null) => void
}

type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>((set) => ({
  // State
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  // Actions
  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null })
      const supabase = createClient()
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      set({
        user: data.user,
        isAuthenticated: !!data.user,
        isLoading: false,
        error: null,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed'
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      })
      throw error
    }
  },

  register: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null })
      const supabase = createClient()
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        throw error
      }

      set({
        user: data.user,
        isAuthenticated: !!data.user,
        isLoading: false,
        error: null,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed'
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      })
      throw error
    }
  },

  logout: async () => {
    try {
      set({ isLoading: true, error: null })
      const supabase = createClient()
      
      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }

      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed'
      set({
        isLoading: false,
        error: errorMessage,
      })
      throw error
    }
  },

  checkAuth: async () => {
    try {
      set({ isLoading: true })
      const supabase = createClient()
      
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error && error.message !== 'Auth session missing!') {
        throw error
      }

      set({
        user,
        isAuthenticated: !!user,
        isLoading: false,
        error: null,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Auth check failed'
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      })
    }
  },

  clearError: () => {
    set({ error: null })
  },

  setUser: (user: User | null) => {
    set({
      user,
      isAuthenticated: !!user,
    })
  },
}))

// Initialize auth state on app start
if (typeof window !== 'undefined') {
  const supabase = createClient()
  
  // Listen to auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    const { setUser } = useAuthStore.getState()
    setUser(session?.user ?? null)
  })

  // Check initial auth state
  useAuthStore.getState().checkAuth()
}