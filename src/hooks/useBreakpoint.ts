'use client'

import { useEffect, useState } from 'react'

// Enhanced breakpoint system with more granular mobile breakpoints
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'>('lg')

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width < 480) setBreakpoint('xs')      // Small phones
      else if (width < 640) setBreakpoint('sm') // Large phones
      else if (width < 768) setBreakpoint('md') // Small tablets
      else if (width < 1024) setBreakpoint('lg') // Tablets
      else if (width < 1280) setBreakpoint('xl') // Small desktops
      else setBreakpoint('2xl')                  // Large desktops
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return breakpoint
}

// More specific mobile detection
export function useIsMobile() {
  const breakpoint = useBreakpoint()
  return breakpoint === 'xs' || breakpoint === 'sm'
}

// Tablet detection
export function useIsTablet() {
  const breakpoint = useBreakpoint()
  return breakpoint === 'md' || breakpoint === 'lg'
}

// Touch device detection
export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }
    
    checkTouch()
    // Re-check on resize in case of device orientation change
    window.addEventListener('resize', checkTouch)
    return () => window.removeEventListener('resize', checkTouch)
  }, [])

  return isTouch
}