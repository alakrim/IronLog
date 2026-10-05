import type { SVGProps } from 'react';

const P = (d: string, extra?: SVGProps<SVGSVGElement>) => (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra} {...props}>
    <path d={d} />
  </svg>
);

export const IconHome = P('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z');
export const IconHistory = P('M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2');
export const IconChart = P('M4 20V10M10 20V4M16 20v-7M22 20H2');
export const IconList = P('M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01');
export const IconGear = P('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const IconCheck = P('M5 12.5l4.5 4.5L19 7.5', { strokeWidth: 3 });
export const IconBack = P('M15 18l-6-6 6-6');
export const IconMore = P('M12 6h.01M12 12h.01M12 18h.01', { strokeWidth: 3.2 });
export const IconPlus = P('M12 5v14M5 12h14');
export const IconX = P('M18 6L6 18M6 6l12 12');
export const IconUp = P('M18 15l-6-6-6 6');
export const IconDown = P('M6 9l6 6 6-6');
export const IconSearch = P('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3');
export const IconTrophy = P('M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3');
export const IconChevron = P('M9 18l6-6-6-6');
export const IconTimer = P('M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M10 2h4');
export const IconSwap = P('M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4');
export const IconInfo = P('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01');
