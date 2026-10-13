import { publicCompanions } from "@/lib/companions";

// The six real setup pages are built ahead of time. Any other id reaches the page, which shows Next's not-found screen.
export function generateStaticParams() {
  return publicCompanions().map((c) => ({ companion: c.id }));
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
