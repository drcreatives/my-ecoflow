import { createSystem, defaultConfig, defineTokens } from '@chakra-ui/react'

// Define our custom tokens for Chakra UI v3
const tokens = defineTokens({
  colors: {
    'primary.black': { value: '#000000' },
    'primary.dark': { value: '#2b2b2b' },
    'accent.green': { value: '#44af21' },
    'accent.greenSecondary': { value: '#00c356' },
    'accent.greenLight': { value: '#00e16e' },
    'accent.blue': { value: '#3a6fe3' },
    'accent.gray': { value: '#ebebeb' },
    'gray.50': { value: '#f9fafb' },
    'gray.100': { value: '#f3f4f6' },
    'gray.200': { value: '#e5e7eb' },
    'gray.300': { value: '#d1d5db' },
    'gray.400': { value: '#9ca3af' },
    'gray.500': { value: '#6b7280' },
    'gray.600': { value: '#4b5563' },
    'gray.700': { value: '#374151' },
    'gray.800': { value: '#1f2937' },
    'gray.900': { value: '#111827' },
  },
  fonts: {
    body: { value: "'Inter', system-ui, sans-serif" },
    heading: { value: "'Inter', system-ui, sans-serif" },
    mono: { value: "'Fira Code', 'Monaco', 'Menlo', monospace" },
  },
})

// Create the system with our custom tokens
export const system = createSystem(defaultConfig, {
  theme: {
    tokens,
  },
})

// Export as theme for backwards compatibility
export const theme = system