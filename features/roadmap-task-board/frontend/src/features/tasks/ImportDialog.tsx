import { useMemo, useState, type ChangeEvent } from "react";

import { Button, Modal } from "@/components/ui";
import { AssigneeChip } from "./AssigneeChip";
import {
  IMPORT_FIELDS,
  IMPORT_TEMPLATE,
  ImportParseError,
  buildImportPlan,
  describePlan,
  readImportRows,
  usedIdPrefixes,
  type ImportMode,
  type ImportPlan,
} from "./taskImport";
import { nextTaskId, type Task } from "./task-model";

const TEMPLATE_TEXT = JSON.stringify(IMPORT_TEMPLATE, null, 2);

/**
 * Import a task file, with the plan shown before anything is written.
 *
 * The dialog exists because the button it replaced did the most destructive
 * thing on this screen with the least ceremony: it swallowed a file and
 * overwrote the board. Three things are on screen before Apply is reachable —
 * the shape the file must have, what will change, and what was refused and
 * why — so approving an import is a decision rather than a leap.
 *
 * Nothing here deletes. A task that is not in the file is not touched, and
 * that is stated on the dialog rather than left to be inferred.
 */
export function ImportDialog({
  open,
  tasks,
  onClose,
  onApply,
}: {
  open: boolean;
  tasks: Task[];
  onClose: () => void;
  onApply: (plan: ImportPlan) => void;
}) {
  const [mode, setMode] = useState<ImportMode>("new-only");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const plan = useMemo<ImportPlan | null>(() => {
    if (!text.trim()) return null;
    try {
      const { rows, shape } = readImportRows(text);
      return buildImportPlan(rows, tasks, (workstream, taken) => {
        // Keep the board's own numbering, and make sure ids handed out inside
        // one file cannot collide with each other.
        let candidate = nextTaskId(tasks, workstream);
        let guard = 0;
        while (taken.has(candidate) && guard < 1000) {
          candidate = nextTaskId([...tasks, { ...tasks[0], id: candidate } as Task], workstream);
          guard += 1;
        }
        return candidate;
      }, shape, mode);
    } catch (error) {
      return null;
    }
  }, [text, tasks, mode]);

  const prefixes = useMemo(() => usedIdPrefixes(tasks), [tasks]);

  const errorText = useMemo(() => {
    if (!text.trim()) return null;
    try {
      readImportRows(text);
      return null;
    } catch (error) {
      return error instanceof ImportParseError ? error.message : "That file could not be read.";
    }
  }, [text]);

  const reset = () => {
    setText("");
    setFileName(null);
    setParseError(null);
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setParseError(null);
    void file
      .text()
      .then((content) => {
        setFileName(file.name);
        setText(content);
      })
      .catch(() => setParseError("That file could not be read from disk."));
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_TEXT], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "task-import-template.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyReason = applying
    ? "The import is being written; wait for it to finish."
    : !text.trim()
      ? "Choose a file or paste one to see what it would change."
      : errorText
        ? "This file cannot be read, so there is nothing to apply."
        : !plan || plan.accepted.length === 0
          ? "No row in this file can be applied."
          : undefined;

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal open={open} title="Import tasks from JSON" onClose={close}>
      <div className="import-dialog">
        <p className="import-lead">
          New tasks land in <strong>Backlog</strong>. <strong>Nothing is ever deleted</strong> — a
          task missing from the file is left exactly as it is, including everything already
          marked Done.
        </p>

        <fieldset className="import-mode">
          <legend>When an id already exists on the board</legend>
          <label>
            <input
              type="radio"
              name="import-mode"
              checked={mode === "new-only"}
              onChange={() => setMode("new-only")}
            />
            <span>
              <strong>Refuse that row</strong>
              <span className="import-mode-note">
                Nothing already recorded can be rewritten. Use this to add new work.
              </span>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="import-mode"
              checked={mode === "upsert"}
              onChange={() => setMode("upsert")}
            />
            <span>
              <strong>Update that task</strong>
              <span className="import-mode-note">
                For re-importing a file you already imported, with corrections.
              </span>
            </span>
          </label>
        </fieldset>

        {prefixes.length ? (
          <p className="import-prefixes">
            Ids already on the board start with{" "}
            {prefixes.map((prefix) => (
              <code key={prefix} className="mono">{prefix}-</code>
            ))}
            . Give new work a prefix that is not in that list and no row can collide.
          </p>
        ) : null}

        <div className="import-actions">
          <label className="btn-ghost file-button">
            Choose JSON file
            <input type="file" accept="application/json" onChange={pickFile} />
          </label>
          <Button variant="ghost" onClick={downloadTemplate}>Download template</Button>
          {fileName ? <span className="import-filename mono">{fileName}</span> : null}
          {text.trim() ? <Button variant="ghost" onClick={reset}>Clear</Button> : null}
        </div>

        <details className="import-spec">
          <summary>What each task block may contain</summary>
          <table className="import-spec-table">
            <thead>
              <tr><th>Field</th><th>Accepts</th><th>If absent</th></tr>
            </thead>
            <tbody>
              {IMPORT_FIELDS.map((field) => (
                <tr key={field.name}>
                  <td className="mono">
                    {field.name}
                    {field.required ? <span className="import-required">required</span> : null}
                  </td>
                  <td>{field.accepts}</td>
                  <td>{field.fallback}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <pre className="import-template mono">{TEMPLATE_TEXT}</pre>
        </details>

        <label className="import-paste">
          <span>…or paste the JSON here</span>
          <textarea
            className="textarea mono"
            rows={5}
            value={text}
            onChange={(event) => {
              setFileName(null);
              setText(event.target.value);
            }}
            placeholder='{ "tasks": [ … ] }'
            aria-label="Task JSON"
          />
        </label>

        {parseError ? <p className="import-error">{parseError}</p> : null}
        {errorText ? <p className="import-error">{errorText}</p> : null}

        {plan && !errorText ? (
          <div className="import-preview">
            <p className="import-summary">{describePlan(plan)}</p>
            {plan.accepted.length ? (
              <table className="import-preview-table">
                <thead>
                  <tr><th>Row</th><th>Action</th><th>ID</th><th>Title</th><th>Assignee</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {plan.accepted.map((entry) => (
                    <tr key={`${entry.row}-${entry.task.id}`} data-action={entry.action}>
                      <td className="mono">{entry.row}</td>
                      <td>
                        <span className={`import-action import-action-${entry.action}`}>
                          {entry.action === "create" ? "New" : "Update"}
                        </span>
                      </td>
                      <td className="mono">{entry.task.id}</td>
                      <td>
                        {entry.task.title}
                        {/* An update replaces a title somebody wrote; showing the
                            one being replaced is the difference between an
                            approved change and a surprise. */}
                        {entry.existingTitle && entry.existingTitle !== entry.task.title ? (
                          <span className="import-was">was: {entry.existingTitle}</span>
                        ) : null}
                      </td>
                      <td><AssigneeChip assignee={entry.task.assignee} compact /></td>
                      <td className="mono">{entry.task.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {plan.rejected.length ? (
              <div className="import-rejected">
                <p className="import-rejected-head">
                  Refused, and not imported. The rest of the file is unaffected.
                </p>
                <ul>
                  {plan.rejected.map((entry) => (
                    <li key={entry.row}>
                      <span className="mono">Row {entry.row}</span>
                      <span className="import-rejected-label">{entry.label}</span>
                      <span className="import-rejected-reason">{entry.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="modal-actions">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button
            onClick={() => {
              if (!plan) return;
              setApplying(true);
              onApply(plan);
              setApplying(false);
              reset();
              onClose();
            }}
            disabled={applyReason !== undefined}
            // §3.5: a disabled control names its reason.
            title={applyReason}
          >
            {plan && !applyReason ? `Apply ${plan.accepted.length} change${plan.accepted.length === 1 ? "" : "s"}` : "Apply"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
