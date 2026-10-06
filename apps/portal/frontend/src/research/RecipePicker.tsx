/**
 * Screen 02 · the run recipe picker: one click selects a ready-made protocol / mode / schedule / trials / seed combination.
 *
 * Presentational only: no fetch, no effect on mount. Picking is the reader's click (or Enter / Space on the focused card);
 * the arrows only move focus. `onPick` receives `applyRecipe(recipe, draft)`; where defaults are adopted is the caller's.
 */

import { useRef } from "react";

import { humaniseTokens } from "./humanise";
import type { RunDraft } from "./runDraft";
import { applyRecipe, recipeIsSelected, type Recipe } from "./runRecipes";

export interface RecipePickerProps {
  recipes: readonly Recipe[];
  draft: RunDraft;
  onPick: (patch: Partial<RunDraft>) => void;
  /** Why nothing is offered (the caller's context-closure text); shown alone when no recipe is enabled. */
  disabledReason?: string | null;
}

const LABEL_CLASS = "mono text-[10px] font-medium uppercase tracking-[.07em]";

export function RecipePicker({ recipes, draft, onPick, disabledReason }: RecipePickerProps) {
  const enabled = recipes.filter((recipe) => recipe.enabled);
  const closed = recipes.filter((recipe) => !recipe.enabled);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  if (enabled.length === 0) {
    return (
      <div data-recipe-none className="flex flex-col gap-1">
        <span className={LABEL_CLASS} style={{ color: "var(--ink-faint)" }}>Run recipe</span>
        {disabledReason ? <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{humaniseTokens(disabledReason)}</p> : null}
      </div>
    );
  }

  const selectedIndex = enabled.findIndex((recipe) => recipeIsSelected(recipe, draft));
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const move = (from: number, step: number) => {
    const next = (from + step + enabled.length) % enabled.length;
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5" data-recipe-picker>
      <span id="s02-recipe-label" className={LABEL_CLASS} style={{ color: "var(--ink-faint)" }}>Run recipe</span>
      <div role="radiogroup" aria-labelledby="s02-recipe-label" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {enabled.map((recipe, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={recipe.id}
              ref={(node) => { refs.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === tabStop ? 0 : -1}
              data-recipe={recipe.id}
              data-selected={selected}
              title={recipe.title}
              onClick={() => onPick(applyRecipe(recipe, draft))}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index, 1); }
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index, -1); }
                else if (event.key === "Home") { event.preventDefault(); move(0, 0); }
                else if (event.key === "End") { event.preventDefault(); move(enabled.length - 1, 0); }
              }}
              className="flex min-w-0 flex-col gap-0.5 rounded-[6px] border px-3 py-2 text-left"
              style={{
                borderColor: selected ? "var(--accent)" : "var(--line)",
                background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
              }}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium" style={{ color: selected ? "var(--accent)" : "var(--ink)" }}>{recipe.label}</span>
                {index === 0 ? <span className="mono text-[9.5px] uppercase tracking-[.06em]" data-recipe-recommended style={{ color: "var(--ink-faint)" }}>recommended</span> : null}
              </span>
              {recipe.summary !== "" ? <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>{recipe.summary}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>Pick a recipe, then adjust anything below.</p>
      {closed.length > 0 ? (
        <div className="flex flex-col gap-1" data-recipe-closed>
          <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>Not opened yet</span>
          <ul className="flex flex-wrap gap-1.5">
            {closed.map((recipe) => (
              <li
                key={recipe.id}
                data-recipe={recipe.id}
                data-closed
                aria-disabled="true"
                title={recipe.reasonCode ?? undefined}
                className="mono rounded-[5px] border px-2 py-1 text-[10px]"
                style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)", opacity: 0.8 }}
              >
                {recipe.label}
                {recipe.reasonCode ? <span> · {humaniseTokens(recipe.reasonCode)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
