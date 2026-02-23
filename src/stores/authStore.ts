import { create } from 'zustand'

/**
 * Minimal auth store for Convex Auth.
 * Auth state is now managed by Convex (useConvexAuth hook).
 * This store only holds ephemeral UI state (loading, error).
 */

interface AuthState {
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>((set) => ({
  isLoading: false,
  error: null,

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}))