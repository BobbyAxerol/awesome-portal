import { Button } from "@/components/ui";
import { RawViewFeature } from "@/features/shared/RawViewFeature";

/** The raw Reports surface remains the default; Interpretation is an adjacent opt-in view. */
export function ReportsFeature({ theme, onOpenInterpretation }: { theme: "light" | "dark"; onOpenInterpretation: () => void }) {
  return (
    <section data-testid="reports-feature">
      <div className="feature-context-bar">
        <span>Reports giữ nguyên nội dung legacy đã khóa.</span>
        <Button type="button" variant="ghost" onClick={onOpenInterpretation} data-testid="open-interpretation">Open interpretation</Button>
      </div>
      <RawViewFeature view="reports" theme={theme} />
    </section>
  );
}
