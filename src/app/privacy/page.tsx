import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'

export const metadata: Metadata = {
  title: 'Google Drive Backup Privacy | My EcoFlow',
  description: 'How My EcoFlow uses Google Drive access for private automatic backups and backup link emails.',
  alternates: { canonical: 'https://myecoflow.devrunor.com/privacy' },
}

const linkClassName = 'text-text-primary underline underline-offset-4 decoration-brand-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="App navigation" className="mb-6 flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/" className={`${linkClassName} inline-flex min-h-11 items-center`}>
          My EcoFlow home
        </Link>
        <Link href="/settings" className={`${linkClassName} inline-flex min-h-11 items-center`}>
          Backup settings
        </Link>
      </nav>

      <Card hover={false}>
        <article className="space-y-7 p-1 text-base leading-relaxed text-text-secondary sm:p-4">
          <header className="space-y-3">
            <p className="text-sm text-text-muted">
              Effective <time dateTime="2026-10-18">18 October 2026</time> (Africa/Lagos)
            </p>
            <h1 className="text-page-title text-text-primary">Google Drive backup privacy</h1>
            <p>
              This policy describes the Google Drive backup feature in My EcoFlow, also
              identified as My EcoFlow Backups on Google&apos;s consent screen. Connecting
              Drive is optional and lets the app save backups to your Google account
              using your saved automatic backup schedule.
            </p>
          </header>

          <section aria-labelledby="drive-access" className="space-y-3">
            <h2 id="drive-access" className="text-lg font-medium text-text-primary">Google access and its purpose</h2>
            <p>
              The app requests Google&apos;s <code className="text-text-primary">drive.file</code> permission.
              This limits access to files and folders the app creates or that you explicitly
              authorize for the app. The app uses that access to create backup folders,
              upload backup files, and check file metadata such as identifiers, names,
              sizes and checksums to verify uploads. It does not request access to all
              files in your Drive.
            </p>
            <p>
              Google Drive data is used to provide and maintain this backup feature.
              The app does not sell it, use it for advertising, or use it to train AI models.
            </p>
          </section>

          <section aria-labelledby="backup-contents" className="space-y-3">
            <h2 id="backup-contents" className="text-lg font-medium text-text-primary">What a backup contains</h2>
            <p>
              Each run creates a private folder containing numbered JSON files and a
              completion manifest. These contain portable device readings, original
              measurement timestamps, device names and serial numbers, measurement
              provenance, configuration values, account details and backup-related
              settings. Raw vendor payloads, authentication records and service
              credentials are excluded.
            </p>
            <p>
              The initial Drive backup includes all readings stored for your account
              at the run&apos;s cutoff. Later successful runs include newly stored readings
              since the last completed Drive backup. The app follows your saved backup
              interval. Keep the manifest and all numbered files together; keep earlier
              backups if you want to retain the full archived history.
            </p>
          </section>

          <section aria-labelledby="providers" className="space-y-3">
            <h2 id="providers" className="text-lg font-medium text-text-primary">Storage and email providers</h2>
            <p>
              Google stores the backup files in your Drive. Convex runs the backup
              jobs and stores application data, connection records and temporary
              prepared backup files. Vercel hosts the app&apos;s frontend.
            </p>
            <p>
              After a Drive backup completes, Resend receives your account email
              address, the private backup folder link, and a summary including the
              reading and file counts to send one notification email. Drive backup
              files and their contents are not attached to that email. The app does
              not make the folder public or grant access to someone who receives
              the link; Google Drive&apos;s access controls still apply.
            </p>
          </section>

          <section aria-labelledby="credentials" className="space-y-3">
            <h2 id="credentials" className="text-lg font-medium text-text-primary">Connection security</h2>
            <p>
              Google handles your Google sign-in and consent. My EcoFlow does not
              receive or store your Google password. The app stores an encrypted
              offline refresh grant in Convex so scheduled backups can run when
              your browser is closed. Credentials stay on the backend and are not
              included in backups or exposed through Settings.
            </p>
          </section>

          <section aria-labelledby="controls" className="space-y-3">
            <h2 id="controls" className="text-lg font-medium text-text-primary">Your controls and retention</h2>
            <p>
              In <Link href="/settings" className={linkClassName}>Settings</Link>, you
              can choose the backup interval, turn automatic backups off, or disconnect
              Google Drive. Disconnecting removes the app&apos;s stored connection
              credentials and cancels pending backup work. It preserves your saved
              preferences and files already uploaded to Drive.
            </p>
            <p>
              Your reading retention setting governs readings in the app&apos;s Convex
              database. It does not automatically expire or delete Drive archives.
              You can manage or delete those files in Google Drive. To remove
              Google&apos;s authorization for the app as well, use your{' '}
              <a href="https://myaccount.google.com/connections" className={linkClassName}>
                Google Account third-party connections
              </a>.
            </p>
          </section>

          <section aria-labelledby="contact" className="space-y-3">
            <h2 id="contact" className="text-lg font-medium text-text-primary">Questions</h2>
            <p>
              Contact the app administrator using the support contact shown on
              the My EcoFlow Backups Google consent screen for questions about
              this feature or its data handling.
            </p>
          </section>
        </article>
      </Card>
    </main>
  )
}
