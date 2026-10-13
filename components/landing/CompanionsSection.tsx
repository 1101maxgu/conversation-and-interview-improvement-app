"use client";

// The one part of the landing page that needs the browser: it loads the companions and shows the picker.
import { useCompanions } from "@/components/ui/session";
import { CompanionStage } from "./CompanionStage";

export function CompanionsSection() {
  const [state, retry] = useCompanions();
  if (state.status === "error") {
    return (
      <div className="banner" data-tone="danger" role="alert">
        <p>We couldn&apos;t load the companions. {state.message}</p>
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  return <CompanionStage companions={state.status === "ready" ? state.data : null} />;
}
