export const isPowerApp = process.env.NEXT_PUBLIC_APP_MODE === 'power'
export const appHome = isPowerApp ? '/meters' : '/dashboard'
