import { useState, type ChangeEvent } from "react";
import { Button, Chip, Input, Modal, StateView, useToast } from "@/components/ui";
import type { ApiMode } from "@/lib/api";
import { ActivityTimeline } from "../shared/ActivityTimeline";
import {
  PHASE_TONES,
  normalisePhase,
  normalisePhases,
  phaseDraft,
  type RoadmapPhase,
} from "./roadmap-model";
import { useRoadmap } from "./useRoadmap";

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

function PhaseEditor({ draft, idLocked, onChange }: { draft: RoadmapPhase; idLocked: boolean; onChange: (field: keyof RoadmapPhase, value: string | number) => void }) {
  return (
    <div className="feature-form-grid">
      <label className="feature-field">
        <span>ID</span>
        <Input value={draft.id} onChange={(event) => onChange("id", event.target.value)} aria-label="Phase ID" disabled={idLocked} />
        {idLocked && <small className="feature-field-help">Server IDs are immutable to preserve audit history.</small>}
      </label>
      <label className="feature-field">
        <span>Name</span>
        <Input value={draft.name} onChange={(event) => onChange("name", event.target.value)} aria-label="Phase name" autoFocus />
      </label>
      <label className="feature-field">
        <span>Start week</span>
        <Input type="number" min="1" max="24" value={draft.start} onChange={(event) => onChange("start", Number(event.target.value))} aria-label="Phase start week" />
      </label>
      <label className="feature-field">
        <span>End week</span>
        <Input type="number" min="1" max="24" value={draft.end} onChange={(event) => onChange("end", Number(event.target.value))} aria-label="Phase end week" />
      </label>
      <label className="feature-field">
        <span>Owner</span>
        <Input value={draft.owner} onChange={(event) => onChange("owner", event.target.value)} aria-label="Phase owner" />
      </label>
      <label className="feature-field">
        <span>Tone</span>
        <select value={draft.tone} onChange={(event) => onChange("tone", event.target.value)} aria-label="Phase tone">
          {PHASE_TONES.map((tone) => <option key={tone}>{tone}</option>)}
        </select>
      </label>
      <label className="feature-field feature-field-wide">
        <span>Outcome</span>
        <textarea value={draft.outcome} onChange={(event) => onChange("outcome", event.target.value)} aria-label="Phase outcome" rows={3} />
      </label>
    </div>
  );
}

export function RoadmapFeature({ apiMode }: { apiMode: ApiMode }) {
  const { phases, persistence, syncState, syncError, needsInitialization, refresh, create, update, remove, replace, reset } = useRoadmap(apiMode);
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoadmapPhase | null>(null);
  const [activityPhaseId, setActivityPhaseId] = useState<string | null>(null);

  const closeEditor = () => {
    setEditingId(null);
    setDraft(null);
  };

  const openNew = () => {
    setEditingId(null);
    setDraft(phaseDraft(phases));
  };

  const openEdit = (phase: RoadmapPhase) => {
    setEditingId(phase.id);
    setDraft({ ...phase });
  };

  const updateDraft = (field: keyof RoadmapPhase, value: string | number) => {
    setDraft((current) => current ? ({ ...current, [field]: value } as RoadmapPhase) : current);
  };

  const saveDraft = () => {
    if (!draft) return;
    const next = normalisePhase({ ...draft }, draft.id || "P0");
    if (!next.id.trim() || !next.name.trim()) {
      toast("Phase cần có ID và name", "bad");
      return;
    }
    if (phases.some((phase) => phase.id === next.id && phase.id !== editingId)) {
      toast(`ID ${next.id} đã tồn tại`, "bad");
      return;
    }
    const saved = { ...next, id: next.id.trim(), name: next.name.trim() };
    void (editingId ? update(saved, editingId) : create(saved))
      .then(() => {
        closeEditor();
        toast(editingId ? "Phase đã cập nhật" : "Phase mới đã thêm", "good");
      })
      .catch((error: Error) => toast(error.message, "bad"));
  };

  const deletePhase = (phase: RoadmapPhase) => {
    if (!window.confirm(`Xóa phase ${phase.id}?`)) return;
    void remove(phase.id)
      .then(() => {
        if (editingId === phase.id) closeEditor();
        if (activityPhaseId === phase.id) setActivityPhaseId(null);
        toast(`Đã xóa ${phase.id}`, "info");
      })
      .catch((error: Error) => toast(error.message, "bad"));
  };

  const importPhases = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
        return replace(normalisePhases(parsed as Record<string, unknown>[]));
      })
      .then(() => toast("Đã import roadmap", "good"))
      .catch(() => toast("File JSON roadmap không hợp lệ", "bad"));
  };

  return (
    <section className="feature-surface" data-testid="roadmap-feature">
      <header className="feature-header">
        <div>
          <p className="mono-label">Phase 4 · {persistence === "v1" ? "audited server workspace" : persistence === "legacy" ? "compatibility sync" : "local-first workspace"}</p>
          <h1>Migration roadmap</h1>
          <p>Timeline edits preserve the existing phase schema and <code>quantPortalPhasesV1</code> key.</p>
        </div>
        <div className="feature-actions">
          <Button type="button" variant="ghost" onClick={() => downloadJson("quant-roadmap-phases.json", phases)}>Export JSON</Button>
          <label className="btn-ghost file-button">Import JSON<input type="file" accept="application/json" onChange={importPhases} /></label>
          <Button type="button" variant="ghost" onClick={() => {
            if (window.confirm("Reset roadmap về bản mặc định?")) {
              void reset().then(() => toast("Roadmap đã reset", "good")).catch((error: Error) => toast(error.message, "bad"));
            }
          }}>Reset</Button>
          <Button type="button" onClick={openNew}>+ Add phase</Button>
        </div>
      </header>

      <div className={`sync-notice ${syncState === "error" ? "sync-notice-error" : ""}`} role={syncState === "error" ? "alert" : "status"}>
        <span>{syncState === "loading" ? "Đang tải workspace…" : syncState === "saving" ? "Đang lưu an toàn…" : persistence === "v1" ? "Server workspace · versioned & audited" : persistence === "legacy" ? "Compatibility API sync" : "Local-only workspace"}</span>
        {persistence !== "local" && <button type="button" onClick={() => void refresh()}>Refresh</button>}
        {needsInitialization && <button type="button" onClick={() => void replace(phases).then(() => toast("Đã khởi tạo server từ snapshot local", "good")).catch((error: Error) => toast(error.message, "bad"))}>Initialize server from local</button>}
        {syncError && <span>{syncError.message}</span>}
      </div>

      {phases.length ? (
        <div className="roadmap-card phase3-roadmap-card">
          <div className="roadmap-week-header" aria-hidden="true">
            <span>Phase</span>
            <div>{Array.from({ length: 24 }, (_, index) => <span key={index}>W{index + 1}</span>)}</div>
            <span>Outcome</span>
          </div>
          <div className="roadmap-rows">
            {phases.map((phase) => (
              <article className="phase3-roadmap-row" key={phase.id} data-testid={`roadmap-phase-${phase.id}`}>
                <div className="roadmap-label"><strong>{phase.id} · {phase.name}</strong><span>{phase.owner || "Unassigned"}</span></div>
                <div className="roadmap-track phase3-roadmap-track" aria-label={`${phase.id} runs from week ${phase.start} to week ${phase.end}`}>
                  <div className={`roadmap-bar phase3-roadmap-bar phase-tone-${phase.tone}`} style={{ gridColumn: `${phase.start} / ${phase.end + 1}` }}>
                    W{phase.start}–W{phase.end}
                  </div>
                </div>
                <div className="roadmap-outcome"><p>{phase.outcome || "No outcome recorded"}</p><div><Chip>{phase.tone}</Chip><button type="button" onClick={() => openEdit(phase)}>Edit</button><button type="button" className="danger-text" onClick={() => deletePhase(phase)}>Delete</button></div></div>
              </article>
            ))}
          </div>
        </div>
      ) : <StateView kind="empty" message="Chưa có phase nào. Nhấn “Add phase” để tạo." />}

      <Modal open={draft !== null} title={editingId ? `Edit ${editingId}` : "New phase"} onClose={closeEditor}>
        {draft && <PhaseEditor draft={draft} idLocked={Boolean(editingId && persistence === "v1")} onChange={updateDraft} />}
        <div className="modal-actions">
          {editingId && draft && <Button type="button" variant="ghost" onClick={() => deletePhase(draft)}>Delete</Button>}
          {editingId && persistence === "v1" && <Button type="button" variant="ghost" onClick={() => setActivityPhaseId(editingId)}>Activity</Button>}
          <span />
          <Button type="button" variant="ghost" onClick={closeEditor}>Cancel</Button>
          <Button type="button" onClick={saveDraft}>Save phase</Button>
        </div>
      </Modal>
      <ActivityTimeline
        collection="roadmap"
        entityId={activityPhaseId ?? ""}
        entityLabel={activityPhaseId ?? "Phase"}
        open={activityPhaseId !== null}
        onClose={() => setActivityPhaseId(null)}
      />
    </section>
  );
}
