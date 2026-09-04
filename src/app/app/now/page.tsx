'use client';

import { Bandscape } from '@/components/Bandscape';

export default function NowPage() {
  return (
    <div className="now-page">
      <header className="panel-head now-head">
        <h1>Now</h1>
        <p>
          Everyone sharing a live location on this page right now. You stand in
          the middle. Distance places the other bands.
        </p>
      </header>
      <Bandscape guestLocation={null} />
    </div>
  );
}
