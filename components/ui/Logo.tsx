import { APP_NAME } from "./brand";

/** The mark: a voice orb with a sound wave through it, which also reads as an S. Uses the current text colour. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <path d="M7.5 18.5 C 10 9.5, 13.5 9.5, 16 16 S 22 22.5, 24.5 13.5" fill="none" stroke="var(--bg, #fff)" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  );
}

/** Mark plus wordmark, for the header and footer. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="brand" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <LogoMark size={size} />
      {APP_NAME}
    </span>
  );
}
