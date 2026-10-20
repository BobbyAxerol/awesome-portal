/** Where the command sits in its three steps. Static: it reports the flow, it does not drive it. */
import "../../css/command.css";

const STEPS = ["1 · Plan · read only", "2 · Confirm · you, typed", "3 · Receipt · the answer"] as const;

export function StepBar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav className="exec-cf-steps" aria-label="Where this command is">
      <ol>
        {STEPS.map((text, index) => {
          const number = (index + 1) as 1 | 2 | 3;
          const state = number === current ? "current" : number < current ? "done" : "ahead";
          return (
            <li key={text} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              {text}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
