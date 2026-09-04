'use client';

import Link from 'next/link';
import { Field } from '@/components/Field';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <>
      <Field />
      <main className="story">
        <header className="story-top">
          <h1 className="wordmark">
            unwavering<span className="dot">.band</span>
          </h1>
          <div className="story-top-actions">
            {loading ? null : user ? (
              <Link className="btn btn-primary" href="/app/history">
                Open your timeline
              </Link>
            ) : (
              <Link className="btn btn-primary" href="/signin">
                Sign in
              </Link>
            )}
          </div>
        </header>

        <section className="story-hero">
          <p className="story-kicker">From Breakfast of Champions</p>
          <h2 className="story-title">
            A person is a vertical, unwavering band of light.
          </h2>
          <p className="story-lede">
            Strip away the machinery and what remains is the part that is alive
            in any of us: an unwavering band. This site treats people that way.
            You stand as light. Distance is the story between you.
          </p>
        </section>

        <section className="story-acts">
          <article className="act">
            <div className="act-bands" aria-hidden="true">
              <span className="act-band me" />
              <span className="act-band you" />
            </div>
            <h3>Now</h3>
            <p>
              You and someone else, side by side on a field of black. Live
              presence. Who is here with you right now, as light, not as a pin
              on a map.
            </p>
          </article>

          <article className="act">
            <div className="act-bands later" aria-hidden="true">
              <span className="act-band me" />
              <span className="act-band you far" />
            </div>
            <h3>Later</h3>
            <p>
              The bands stay. The space between them changes. People move.
              Relationships stretch and close without anyone having to explain
              where they slept.
            </p>
          </article>

          <article className="act">
            <div className="act-wave" aria-hidden="true">
              <svg viewBox="0 0 200 60" preserveAspectRatio="none">
                <path
                  d="M0 40 C20 40 25 18 40 18 C55 18 55 42 70 42 C85 42 90 10 110 10 C130 10 135 35 150 35 C165 35 170 22 185 22 L200 22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <h3>Over time</h3>
            <p>
              A chart of how far apart two bands have been. Peaks, plateaus,
              troughs. Hover a day and see only what the other person has
              allowed: miles, a city, or the exact place.
            </p>
          </article>
        </section>

        <section className="story-promise">
          <h3>What you get</h3>
          <ul>
            <li>Opt in to share and log location. Withdrawal clears the live coordinates.</li>
            <li>Import Google Timeline history into a private table only you can read.</li>
            <li>Create relationships. Set privacy per person: distance, city, or exact.</li>
            <li>Name the places that matter on your own timeline.</li>
            <li>Watch distance over time with another band on the chart.</li>
          </ul>
          <div className="story-cta">
            {user ? (
              <Link className="btn btn-primary" href="/app/history">
                Continue
              </Link>
            ) : (
              <Link className="btn btn-primary" href="/signin">
                Begin
              </Link>
            )}
          </div>
        </section>

        <footer className="story-foot">
          <p>
            The real part of a person is unwavering and pure, no matter what
            preposterous adventure may befall us.
          </p>
          <p className="story-legal">
            <Link href="/privacy">Privacy</Link>
            {' · '}
            <Link href="/terms">Terms</Link>
            {' · '}
            <Link href="/support">Support</Link>
          </p>
        </footer>
      </main>
    </>
  );
}
