import type { ReactNode } from "react";
import css from "./PracticeBoard.module.css";

// A loose spread of tiles for the situations people practise. Decorative: the companions below say the same in words.
const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

const TILES: { label: string; note: string; icon: ReactNode }[] = [
  {
    label: "Interview",
    note: "Round one",
    icon: icon(
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18" />
      </>,
    ),
  },
  {
    label: "Case",
    note: "Market entry",
    icon: icon(<path d="M3 21h18M6 21V12M12 21V4M18 21v-7" />),
  },
  {
    label: "Sales",
    note: "Price pushback",
    icon: icon(
      <>
        <path d="M3 12.5V4h8.5L21 13.5 13.5 21 3 12.5z" />
        <circle cx="7.5" cy="8.5" r="1.2" />
      </>,
    ),
  },
  {
    label: "Presentation",
    note: "The Q&A",
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M12 16v4M8 20h8" />
      </>,
    ),
  },
  {
    label: "Conversation",
    note: "Small talk",
    icon: icon(
      <>
        <path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" strokeWidth="2.4" />
      </>,
    ),
  },
  {
    label: "Friend",
    note: "A catch-up",
    icon: icon(
      <>
        <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
        <path d="M8 3.5v2M12 3.5v2" />
      </>,
    ),
  },
];

export function PracticeBoard({ className }: { className?: string }) {
  return (
    <ul className={`${css.board} ${className ?? ""}`} aria-hidden="true">
      {TILES.map((t) => (
        <li key={t.label} className={css.tile}>
          <span className={css.icon}>{t.icon}</span>
          <span className={css.label}>{t.label}</span>
          <span className={css.note}>{t.note}</span>
        </li>
      ))}
    </ul>
  );
}
