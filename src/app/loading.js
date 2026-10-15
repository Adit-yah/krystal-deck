export default function Loading() {
  return (
    <div className="kd-boot-screen" role="status" aria-live="polite" aria-label="Loading Krystal KD-01">
      <div className="kd-boot-card">
        <div className="kd-boot-cassette" aria-hidden="true">
          <div className="kd-boot-window">
            <span className="kd-boot-reel kd-boot-reel-l" />
            <span className="kd-boot-tape-bridge" />
            <span className="kd-boot-reel kd-boot-reel-r" />
          </div>
          <div className="kd-boot-head-slot" />
        </div>
        <div className="kd-boot-meta">
          <div className="kd-boot-badge-row">
            <span className="kd-boot-led" />
            <span className="kd-boot-series">STUDIO HARDWARE SERIES</span>
          </div>
          <h1 className="kd-boot-title">Krystal KD-01</h1>
          <p className="kd-boot-sub">Calibrating 3D optical deck &amp; analog tape transport…</p>
        </div>
        <div className="kd-boot-bar-track" aria-hidden="true">
          <div className="kd-boot-bar-fill" />
        </div>
      </div>
    </div>
  );
}
