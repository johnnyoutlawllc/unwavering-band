import { Field } from '@/components/Field';
import { Panel } from '@/components/Panel';

export default function Home() {
  return (
    <>
      <Field />

      <main>
        <div className="stack center">
          <p className="eyebrow">Est. 2026</p>
          <h1 className="wordmark">
            unwavering<span className="dot">.band</span>
          </h1>
          <p className="lede">
            Kurt Vonnegut once had a narrator strip everything off a person
            except the one thing that was actually them, and what was left was
            <strong> a narrow band of light</strong>, running head to foot,
            steady, refusing to flicker. No face, no story, no job. Just the
            light, and the fact that it held.
          </p>
        </div>

        <div className="stack center">
          <hr className="rule" />
          <p className="fine">
            This is the beginning of something built on that picture. Everybody
            who signs in becomes one band. Say where you are and your band gets
            a place to stand. That is the whole idea, and right now it is only
            an idea, so what you are joining is a list, not a product.
          </p>
        </div>

        <Panel />
      </main>

      <footer>
        <p>
          unwavering.band &middot; a{' '}
          <a href="https://dataday.studio">dataday.studio</a> project &middot;
          Rockwall, TX
        </p>
        <p>
          Location is opt in, one reading at a time, and deleted the moment you
          turn it off.
        </p>
      </footer>
    </>
  );
}
