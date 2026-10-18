/**
 * Logo Belanjaku: tas belanja tersenyum di atas squircle oranye bergradasi.
 * Versi file statisnya ada di app/icon.svg (dipakai sebagai favicon).
 */
export default function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="belanjaku-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffa96f" />
          <stop offset="1" stopColor="#f04e12" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#belanjaku-grad)" />
      <path d="M15.4 15.6v-1.9a4.6 4.6 0 0 1 9.2 0v1.9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10.8 15.6h18.4l-1.35 13.3a3 3 0 0 1-3 2.7h-9.7a3 3 0 0 1-3-2.7z" fill="#fff" />
      <path d="M16 22.6c1.15 1.55 2.45 2.35 4 2.35s2.85-.8 4-2.35" fill="none" stroke="#f04e12" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="31.2" cy="9" r="2" fill="#fff" opacity="0.9" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      Belanja<em>ku</em>
    </span>
  );
}
