/**
 * Outline Instagram and Facebook marks for platform labels and links. Lucide
 * dropped its brand icons, so these are drawn here in the same stroke style.
 */
type IconProps = { className?: string };

export function InstagramIcon({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 21v-8h3l.5-3.5H14V7.8c0-1 .4-1.8 1.9-1.8H18V3.1A24 24 0 0 0 15.4 3C12.8 3 11 4.6 11 7.5v2H8V13h3v8" />
    </svg>
  );
}
