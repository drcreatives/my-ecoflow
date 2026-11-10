import Link from 'next/link'
import { Gauge } from 'lucide-react'
import AuthWrapper from '@/components/AuthWrapper'
import LogoutButton from '@/components/LogoutButton'

export default function PowerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthWrapper>
      <div className="min-h-dvh bg-bg-base">
        <header className="sticky top-0 z-30 border-b border-stroke-subtle bg-bg-base">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8">
            <Link href="/meters" className="inline-flex min-h-11 items-center gap-3 rounded-inner">
              <span className="grid size-9 place-items-center rounded-inner bg-brand-primary text-bg-base">
                <Gauge size={21} aria-hidden="true" />
              </span>
              <span className="text-lg font-medium tracking-tight text-text-primary">Power</span>
            </Link>
            <div className="flex items-center gap-3 sm:gap-5">
              <span className="hidden text-sm text-text-muted sm:inline">Meter operations</span>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </AuthWrapper>
  )
}
