import {C2P7EmergencyReviewCandidateService,C2P7ReviewCandidateService} from "./c2-p7-review-candidate.service";

/** SOURCE-ONLY DI candidate; optional Research bootstrap injection only. Inputs are trusted
 * server configuration/factories, never request fields. A dark feature must
 * not read or construct B1, source, attestor, credentials, or a review graph. */
type ReviewPort=Pick<C2P7ReviewCandidateService,"preview"|"confirm"|"resume"|"resumeByKey">;
type EmergencyPort=Pick<C2P7EmergencyReviewCandidateService,"revoke">;
type Option<T>={enabled?:boolean;environment?:string;create?:()=>T};
export type C2P7CandidateComposition={review:ReviewPort;emergency:EmergencyPort;
  review_state:"FACTORY_RETURNED_NOT_COMMISSIONED"|"DARK";emergency_state:"FACTORY_RETURNED_NOT_COMMISSIONED"|"DARK"};
const unavailable=async():Promise<never>=>{throw new Error("C2_P7_REVIEW_UNAVAILABLE");};
const reviewDark:ReviewPort=Object.freeze({preview:unavailable,confirm:unavailable,resume:unavailable,resumeByKey:unavailable});
const emergencyDark:EmergencyPort=Object.freeze({revoke:unavailable});

/** Separate gates and exception domains are deliberate: a missing/broken B1
 * must not prevent a separately enabled emergency reduction graph. A returned
 * FACTORY_RETURNED_NOT_COMMISSIONED is not a readiness or authority claim. */
export function composeC2P7Candidate(options?:{review?:Option<C2P7ReviewCandidateService>;
  emergency?:Option<C2P7EmergencyReviewCandidateService>}):C2P7CandidateComposition {
  let review:ReviewPort=reviewDark,emergency:EmergencyPort=emergencyDark;
  if(options?.review?.enabled===true&&options.review.environment==="RESEARCH"&&typeof options.review.create==="function") {
    try {const instance=options.review.create();if(instance instanceof C2P7ReviewCandidateService)review=instance;}catch{/* stay dark */}
  }
  if(options?.emergency?.enabled===true&&options.emergency.environment==="RESEARCH"&&typeof options.emergency.create==="function") {
    try {const instance=options.emergency.create();if(instance instanceof C2P7EmergencyReviewCandidateService)emergency=instance;}catch{/* stay dark */}
  }
  return Object.freeze({review,emergency,review_state:review===reviewDark?"DARK":"FACTORY_RETURNED_NOT_COMMISSIONED",
    emergency_state:emergency===emergencyDark?"DARK":"FACTORY_RETURNED_NOT_COMMISSIONED"});
}
