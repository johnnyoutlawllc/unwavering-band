import Link from 'next/link';

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="legal">
      <header className="legal-top">
        <Link href="/" className="app-nav-brand">
          unwavering<span className="dot">.band</span>
        </Link>
        <nav className="legal-nav">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
          <Link href="/signin">Sign in</Link>
        </nav>
      </header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-updated">Updated {updated}</p>
        {children}
      </article>
    </main>
  );
}
