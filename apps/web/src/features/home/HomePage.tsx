// Marketing page for logged-out visitors; the builder for signed-in users
// (FR-13, matches the source Home behavior).

import { useAuth } from '../../contexts/auth-context'
import SheetBuilder from '../sheets/SheetBuilder'

export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) return <main className="loading">Loading…</main>
  if (user) return <SheetBuilder />

  return (
    <main className="marketing">
      <h1>AWS Token Designer</h1>
      <p className="tagline">
        Generate or upload RPG token images, arrange up to 63 on a print sheet, and print it —
        all in your browser.
      </p>
      <ul className="marketing-list">
        <li>Upload your own art (PNG, JPEG, WebP, GIF up to 10 MB)</li>
        <li>AI-generated tokens from a prompt (Stability AI)</li>
        <li>7×9 print sheet — 63 tokens per page</li>
      </ul>
      <p className="marketing-cta">Sign in or register to start building your first sheet.</p>
    </main>
  )
}
