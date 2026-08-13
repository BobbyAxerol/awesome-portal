import { Button, Card, Chip, SectionTitle } from "@/components/ui";

/** Lazy-loaded extension beside Reports; it never frames or controls an external service. */
export function InterpretationFeature({ onOpenReports }: { onOpenReports: () => void }) {
  return (
    <section className="feature-surface interpretation-feature" data-testid="interpretation-feature">
      <header className="feature-header">
        <div>
          <p className="mono-label">Phase 3 · lazy extension</p>
          <SectionTitle>Interpretation workspace</SectionTitle>
          <p>Không iframe, không control-plane và không thay thế Reports legacy. Surface này là chỗ nối contract đọc-only cho báo cáo diễn giải sau này.</p>
        </div>
        <Button type="button" variant="ghost" onClick={onOpenReports}>Back to reports</Button>
      </header>
      <div className="interpretation-grid">
        <Card className="interpretation-card">
          <Chip tone="accent">Read-only boundary</Chip>
          <h3>Report context</h3>
          <p>Interpretation sẽ nhận manifest, artifact và metric đã được Reports xác thực; không gọi trực tiếp broker, engine hoặc dữ liệu live.</p>
        </Card>
        <Card className="interpretation-card">
          <Chip>Next contract</Chip>
          <h3>Evidence-first</h3>
          <p>Đưa input, version, SHA và provenance vào một contract riêng trước khi tích hợp bất kỳ service diễn giải nào.</p>
        </Card>
        <Card className="interpretation-card">
          <Chip tone="good">Legacy safe</Chip>
          <h3>Reports remain default</h3>
          <p>Hash <code>#view=reports</code> luôn mở đúng Reports gốc. <code>#view=interpretation</code> chỉ tải bundle này khi được chọn.</p>
        </Card>
      </div>
    </section>
  );
}
