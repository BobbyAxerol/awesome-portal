import { useMemo, useState, type ChangeEvent } from "react";
import { Button, Field, Input, Modal, Select, StateView, Textarea, useToast } from "@/components/ui";
import type { ApiMode } from "@/lib/api";
import { useTasks } from "../tasks/useTasks";
import { ActivityTimeline } from "../shared/ActivityTimeline";
import {
  PHASE_TONES,
  normalisePhase,
  normalisePhases,
  phaseDraft,
  programHorizon,
  type RoadmapPhase,
} from "./roadmap-model";
import { RoadmapTimeline } from "./RoadmapTimeline";
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
      <Field label="ID" hint={idLocked ? "Server IDs are immutable to preserve audit history." : undefined}>
        {(field) => (
          <Input
            {...field}
            className="input input-mono"
            value={draft.id}
            onChange={(event) => onChange("id", event.target.value)}
            aria-label="Phase ID"
            disabled={idLocked}
          />
        )}
      </Field>
      <Field label="Name">
        {(field) => (
          <Input {...field} value={draft.name} onChange={(event) => onChange("name", event.target.value)} aria-label="Phase name" autoFocus />
        )}
      </Field>
      <Field label="Start week">
        {(field) => (
          <Input {...field} className="input input-mono" type="number" min="1" max="24" value={draft.start} onChange={(event) => onChange("start", Number(event.target.value))} aria-label="Phase start week" />
        )}
      </Field>
      <Field label="End week">
        {(field) => (
          <Input {...field} className="input input-mono" type="number" min="1" max="24" value={draft.end} onChange={(event) => onChange("end", Number(event.target.value))} aria-label="Phase end week" />
        )}
      </Field>
      <Field label="Owner">
        {(field) => (
          <Input {...field} value={draft.owner} onChange={(event) => onChange("owner", event.target.value)} aria-label="Phase owner" />
        )}
      </Field>
      <Field label="Tone">
        {(field) => (
          <Select {...field} value={draft.tone} onChange={(event) => onChange("tone", event.target.value)} aria-label="Phase tone">
            {PHASE_TONES.map((tone) => <option key={tone}>{tone}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Outcome" wide>
        {(field) => (
          <Textarea {...field} value={draft.outcome} onChange={(event) => onChange("outcome", event.target.value)} aria-label="Phase outcome" rows={3} />
        )}
      </Field>
    </div>
  );
}

/**
 * Program-level facts, all counted from the phases actually loaded.
 *
 * Nothing here is a target or an estimate: horizon is the furthest exit week,
 * concurrency is the largest number of phases live in any single week.
 */
function ProgramSummary({ phases }: { phases: RoadmapPhase[] }) {
  const horizon = programHorizon(phases);
  const peakConcurrency = useMemo(() => {
    let peak = 0;
    for (let week = 1; week <= horizon; week += 1) {
      peak = Math.max(peak, phases.filter((phase) => phase.start <= week && week <= phase.end).length);
    }
    return peak;
  }, [phases, horizon]);
  const owners = new Set(phases.map((phase) => phase.owner.trim()).filter(Boolean)).size;

  return (
    <dl className="program-summary" data-testid="program-summary">
      <div>
        <dt>Horizon</dt>
        <dd className="mono">W1–W{horizon}</dd>
      </div>
      <div>
        <dt>Phases</dt>
        <dd className="mono">{phases.length}</dd>
      </div>
      <div>
        <dt>Peak song song</dt>
        <dd className="mono">{peakConcurrency} phase/tuần</dd>
      </div>
      <div>
        <dt>Owner</dt>
        <dd className="mono">{owners ? `${owners} nhóm` : "chưa gán"}</dd>
      </div>
    </dl>
  );
}

export function RoadmapFeature({ apiMode }: { apiMode: ApiMode }) {
  const { phases, persistence, syncState, syncError, needsInitialization, refresh, create, update, remove, replace, reset } = useRoadmap(apiMode);
  // Read-only join: phase delivery is counted from the same tasks the board
  // owns, so the roadmap cannot report progress the board disagrees with.
  const { tasks } = useTasks(apiMode);
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
        <>
          <ProgramSummary phases={phases} />
          <RoadmapTimeline
            phases={phases}
            tasks={tasks}
            onEdit={openEdit}
            onActivity={persistence === "v1" ? (phase) => setActivityPhaseId(phase.id) : null}
            onDelete={deletePhase}
          />
        </>
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
