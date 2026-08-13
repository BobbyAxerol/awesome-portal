import { RawViewFeature } from "@/features/shared/RawViewFeature";

export function EvidenceFeature({ theme }: { theme: "light" | "dark" }) {
  return <RawViewFeature view="evidence" theme={theme} />;
}
