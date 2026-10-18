import type { SVGProps } from "react";

const PATHS = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L22 7H6" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13v4" />
      <path d="M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" />
      <circle cx="16" cy="14" r="1.3" />
    </>
  ),
  stamp: (
    <>
      <path d="M5 21h14" />
      <path d="M6 17h12v-3a2 2 0 0 0-2-2h-2.5V9.5a3 3 0 1 0-3 0V12H8a2 2 0 0 0-2 2z" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5" />
      <path d="M9 7h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14a6 6 0 0 1 3.5 6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <path d="M12 17h.01" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M9 16l-4-4 4-4" />
      <path d="M5 12h11" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v5h1" />
    </>
  ),
  anchor: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V21" />
      <path d="M8 11h8" />
      <path d="M4 13a8 8 0 0 0 16 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M5 12h14M13 6l6 6-6 6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  box: (
    <>
      <path d="M3 7l9-4 9 4-9 4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 10" />
    </>
  ),
  plane: <path d="M10.5 13.5L3 11l2-2 7 1 5-5a2 2 0 0 1 3 3l-5 5 1 7-2 2-2.5-7.5" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  cap: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c3 2 9 2 12 0v-5" />
    </>
  ),
  ship: (
    <>
      <path d="M3 17l2 4h14l2-4-9-3z" />
      <path d="M6 15V9h12v6" />
      <path d="M12 5v4" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" />
      <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.6-3.4 8.4-8 9-4.6-.6-8-4.4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 3.5v5h5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  swap: (
    <>
      <path d="M7 4L3 8l4 4" />
      <path d="M3 8h14" />
      <path d="M17 20l4-4-4-4" />
      <path d="M21 16H7" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="5" r="2.2" />
      <path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6-2 1.6-2.5-1.6L5 21z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  contract: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 17c1.2-1.6 2-1.6 2.6 0s1.4 1.6 2.4 0 1.8-1 3 0" />
    </>
  ),
  bars: (
    <>
      <path d="M3 20h18" />
      <rect x="5" y="10" width="3.2" height="7" rx="1" />
      <rect x="10.4" y="5" width="3.2" height="12" rx="1" />
      <rect x="15.8" y="12" width="3.2" height="5" rx="1" />
    </>
  ),
  curve: (
    <>
      <path d="M3 20h18" />
      <path d="M4 17c4 0 5-1.5 7-5.5S14.5 5 20 5" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

type Props = { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">;

export default function Icon({ name, size, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
