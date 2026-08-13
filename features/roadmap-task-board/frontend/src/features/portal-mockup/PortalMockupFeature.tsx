import { RawViewFeature } from "@/features/shared/RawViewFeature";

/**
 * This is embedded feature source, not a deployable child service. The mockup is
 * deliberately retained as a locked raw view until a control-plane contract exists.
 */
export function PortalMockupFeature({ theme }: { theme: "light" | "dark" }) {
  return <RawViewFeature view="portal" theme={theme} />;
}
