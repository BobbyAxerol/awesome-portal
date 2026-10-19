/**
 * The seven certification steps (hi-fi sandbox.html `.steps`): a 4-column grid that is 2 columns
 * under 1100px and 1 under 660px, each step a top-bordered cell with its word, its sentence and
 * when it was checked and by whom.
 *
 * The state word is the server's evaluation: Pass, Fail, Stale (evidence that lapsed, not a
 * failure), Unavailable, Not recorded (V2: no evidence stored) or Unknown (a word this build does
 * not read, never Pass). The sentence is the server's `summary` where the body has one. A V2
 * body has none, so each cell says `Not published` and the grid prints the request id once.
 * Time is the published UTC instant; expiry is the server's `expires_at`, never computed.
 */
import { Flag } from "../../Flag";
import { NotPublished, SectionPanel } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { STEP_FLAG, sourceWord } from "./model";
import type { StepView, StepsView } from "./readSandbox";

function Meta({ step }: { step: StepView }) {
  const who = sourceWord(step.authority);
  const parts: string[] = [];
  if (step.state === "not-recorded") parts.push("No evidence recorded");
  else parts.push(step.asOf === null ? "Checked time not published" : `Checked ${formatAsOf(step.asOf)}`);
  if (who !== null) parts.push(who);
  if (step.expiresAt !== null) parts.push(`Expires ${formatAsOf(step.expiresAt)}`);
  return <p className="exec-sbx-step-meta">{parts.join(" · ")}</p>;
}

export function StepsGrid({ steps, hasSentences }: { steps: StepsView; hasSentences: boolean }) {
  if (steps.availability === "absent") {
    return (
      <SectionPanel title="Steps">
        <p className="exec-blk-na">{steps.text}</p>
        {steps.code === null ? null : <p className="exec-sbx-code">{steps.code}</p>}
        <p className="exec-sbx-note">
          <NotPublished id="FE-028">Gate criteria</NotPublished>
        </p>
      </SectionPanel>
    );
  }
  return (
    <div className="exec-sbx-steps-wrap">
      <ol className="exec-sbx-steps" aria-label="Certification steps">
        {steps.items.map((step) => {
          const flag = STEP_FLAG[step.state];
          return (
            <li key={step.key} className="exec-sbx-step" data-state={step.state}>
              <div className="exec-sbx-step-head">
                <span className="exec-sbx-step-name">
                  <span className="exec-sbx-step-n" aria-hidden="true">{step.ordinal}</span>
                  <span className="exec-sbx-step-label">
                    <span className="exec-blk-sr">Step {step.ordinal}: </span>
                    {step.label}
                  </span>
                </span>
                <Flag kind={flag.kind} label={flag.label} size="sm" />
              </div>
              {hasSentences ? (
                <p className="exec-sbx-step-why">{step.summary ?? <span className="exec-blk-na">Not available</span>}</p>
              ) : (
                <p className="exec-sbx-step-why"><NotPublished id="FE-028" compact /></p>
              )}
              <Meta step={step} />
            </li>
          );
        })}
      </ol>
      {hasSentences ? null : (
        <p className="exec-sbx-note">
          The stored evaluation of each step is shown. Its explanation is <NotPublished id="FE-028">Gate criteria</NotPublished>.
        </p>
      )}
    </div>
  );
}
