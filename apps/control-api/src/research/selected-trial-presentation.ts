/** W1 B-4/B-5: display only; never a selection identity or hash input. */
import { z } from "zod";
import { RS02_DELTA_WFO_GLOBAL_PROFILE_ID, RS02_SIGNAL_NOTIONAL_PROFILE_ID } from "./delta-wfo.profile";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";

export const SelectedTrialPresentationSchema = z.object({
  selected_trial_ordinal: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  selected_trial_ordinal_scope: z.enum(["RUN_GLOBAL", "STUDY_LOCAL"]).nullable(),
  selected_trial_ordinal_reason_code: z.enum([
    "SELECTION_HAS_NO_TRIAL", "SOURCE_TRIAL_NUMBER_NOT_PUBLISHED", "STUDY_LOCAL_TRIAL_MAPPING_NOT_PUBLISHED",
  ]).nullable(),
}).strict();

/** Original zero-based source number, never the P11 cumulative progress ordinal. */
export function sourceTrialOrdinal(source: string | null | undefined): number | null {
  if (typeof source !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(source)) return null;
  const number = Number(source);
  return Number.isSafeInteger(number) && Number.isSafeInteger(number + 1) ? number + 1 : null;
}

export function selectedTrialPresentation(
  id: string | null,
  profileId: string,
  native?: { trial_id: string; source_trial_id: string | null; study_id?: string | null },
): z.infer<typeof SelectedTrialPresentationSchema> {
  const absent = (reason: NonNullable<z.infer<typeof SelectedTrialPresentationSchema>["selected_trial_ordinal_reason_code"]>) => ({
    selected_trial_ordinal: null, selected_trial_ordinal_scope: null, selected_trial_ordinal_reason_code: reason,
  });
  if (id === null) return absent("SELECTION_HAS_NO_TRIAL");
  const causal = profileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id;
  const global = profileId === RS02_DELTA_WFO_GLOBAL_PROFILE_ID || profileId === RS02_SIGNAL_NOTIONAL_PROFILE_ID;
  // Causal IDs are opaque to this operation. A separate retained native
  // mapping must bind both the original study and local Optuna number.
  if (causal && (!native?.study_id || native.source_trial_id === null
    || native.trial_id !== id || !id.startsWith(`study_${native.study_id}.trial_`))) {
    return absent("STUDY_LOCAL_TRIAL_MAPPING_NOT_PUBLISHED");
  }
  const source = causal ? native!.source_trial_id! : id;
  if ((!global && !causal) || !/^(?:0|[1-9][0-9]*)$/.test(source)) return absent("SOURCE_TRIAL_NUMBER_NOT_PUBLISHED");
  const ordinal = sourceTrialOrdinal(source);
  if (ordinal === null) return absent("SOURCE_TRIAL_NUMBER_NOT_PUBLISHED");
  return { selected_trial_ordinal: ordinal, selected_trial_ordinal_scope: causal ? "STUDY_LOCAL" : "RUN_GLOBAL",
    selected_trial_ordinal_reason_code: null };
}
