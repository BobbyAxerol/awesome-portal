import { useState, type ChangeEvent } from "react";
import { Button, Chip, Input, Modal, StateView, useToast } from "@/components/ui";
import type { ApiMode } from "@/lib/api";
import {
  PHASE_TONES,
  normalisePhase,
  normalisePhases,
  phaseDraft,
  replacePhase,
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

function PhaseEditor({ draft, onChange }: { draft: RoadmapPhase; onChange: (field: keyof RoadmapPhase, value: string | number) => void }) {
  return (
    <div className="feature-form-grid">
      <label className="feature-field">
        <span>ID</span>
        <Input value={draft.id} onChange={(event) => onChange("id", event.target.value)} aria-label="Phase ID" />
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
  const { phases, replace, reset } = useRoadmap(apiMode);
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoadmapPhase | null>(null);

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
    replace(replacePhase(phases, { ...next, id: next.id.trim(), name: next.name.trim() }, editingId ?? next.id));
    closeEditor();
    toast(editingId ? "Phase đã cập nhật" : "Phase mới đã thêm", "good");
  };

  const deletePhase = (phase: RoadmapPhase) => {
    if (!window.confirm(`Xóa phase ${phase.id}?`)) return;
    replace(phases.filter((item) => item.id !== phase.id));
    if (editingId === phase.id) closeEditor();
    toast(`Đã xóa ${phase.id}`, "info");
  };

  const importPhases = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
        replace(normalisePhases(parsed as Record<string, unknown>[]));
        toast("Đã import roadmap", "good");
      })
      .catch(() => toast("File JSON roadmap không hợp lệ", "bad"));
  };

  return (
    <section className="feature-surface" data-testid="roadmap-feature">
      <header className="feature-header">
        <div>
          <p className="mono-label">Phase 3 · local-first roadmap domain</p>
          <h1>Migration roadmap</h1>
          <p>Timeline edits preserve the existing phase schema and <code>quantPortalPhasesV1</code> key.</p>
        </div>
        <div className="feature-actions">
          <Button type="button" variant="ghost" onClick={() => downloadJson("quant-roadmap-phases.json", phases)}>Export JSON</Button>
          <label className="btn-ghost file-button">Import JSON<input type="file" accept="application/json" onChange={importPhases} /></label>
          <Button type="button" variant="ghost" onClick={() => {
            if (window.confirm("Reset roadmap về bản mặc định?")) {
              reset();
              toast("Roadmap đã reset", "good");
            }
          }}>Reset</Button>
          <Button type="button" onClick={openNew}>+ Add phase</Button>
        </div>
      </header>

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
        {draft && <PhaseEditor draft={draft} onChange={updateDraft} />}
        <div className="modal-actions">
          {editingId && draft && <Button type="button" variant="ghost" onClick={() => deletePhase(draft)}>Delete</Button>}
          <span />
          <Button type="button" variant="ghost" onClick={closeEditor}>Cancel</Button>
          <Button type="button" onClick={saveDraft}>Save phase</Button>
        </div>
      </Modal>
    </section>
  );
}
