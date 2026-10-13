import { notFound } from "next/navigation";

// Design previews are for local work only: they do not exist on a deployed site.
export default function DesignLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
