/*
 * The background. Fixed set of bands, laid out by hand rather than randomly,
 * so the composition is the same every load and nobody gets a bad one.
 * Server rendered on purpose: it is pure CSS once it lands.
 */

type Band = {
  left: string;
  color: string;
  width: string;
  blur: string;
  opacity: number;
  duration: string;
  delay: string;
};

const BANDS: Band[] = [
  { left: '8%', color: 'var(--band-1)', width: '2px', blur: '10px', opacity: 0.4, duration: '31s', delay: '-4s' },
  { left: '17%', color: 'var(--band-2)', width: '1px', blur: '5px', opacity: 0.55, duration: '24s', delay: '-11s' },
  { left: '26%', color: 'var(--band-5)', width: '3px', blur: '16px', opacity: 0.26, duration: '38s', delay: '-2s' },
  { left: '34%', color: 'var(--band-1)', width: '1px', blur: '4px', opacity: 0.62, duration: '27s', delay: '-17s' },
  { left: '43%', color: 'var(--band-3)', width: '2px', blur: '11px', opacity: 0.34, duration: '33s', delay: '-8s' },
  { left: '50%', color: 'var(--band-2)', width: '1px', blur: '3px', opacity: 0.7, duration: '22s', delay: '-14s' },
  { left: '58%', color: 'var(--band-4)', width: '2px', blur: '13px', opacity: 0.3, duration: '36s', delay: '-6s' },
  { left: '66%', color: 'var(--band-1)', width: '1px', blur: '5px', opacity: 0.5, duration: '25s', delay: '-19s' },
  { left: '75%', color: 'var(--band-5)', width: '2px', blur: '9px', opacity: 0.38, duration: '30s', delay: '-3s' },
  { left: '84%', color: 'var(--band-2)', width: '3px', blur: '18px', opacity: 0.24, duration: '40s', delay: '-9s' },
  { left: '92%', color: 'var(--band-3)', width: '1px', blur: '6px', opacity: 0.44, duration: '28s', delay: '-15s' },
];

export function Field() {
  return (
    <>
      <div className="field" aria-hidden="true">
        {BANDS.map((b) => (
          <span
            key={b.left}
            className="band"
            style={
              {
                left: b.left,
                '--c': b.color,
                '--w': b.width,
                '--blur': b.blur,
                '--o': b.opacity,
                '--dur': b.duration,
                '--delay': b.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
