import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { AuthNav } from "@/components/ui/AuthNav";
import { APP_NAME } from "@/components/ui/brand";
import { Logo } from "@/components/ui/Logo";
import "./globals.css";

// One family at two jobs: weight 300 for headlines, 400 and 500 for everything else.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: `${APP_NAME}: practise real conversations out loud`, template: `%s | ${APP_NAME}` },
  description:
    "Practise interviews, pitches, case questions and everyday conversation by talking out loud with a friendly AI companion, then get notes on how you did.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <header
          className="container site-header"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <Link href="/" aria-label={`${APP_NAME} home`} style={{ textDecoration: "none" }}>
            <Logo />
          </Link>
          <AuthNav />
        </header>
        {children}
      </body>
    </html>
  );
}
