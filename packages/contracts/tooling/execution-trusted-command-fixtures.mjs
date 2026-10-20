/** Authored TEST_ONLY fixture seeds. Never source authority or a product receipt.
 * Stored status and served status deliberately have separate names. Currency
 * below is copied from this synthetic original intent, not guessed from ACK.
 */
export function trustedCommandFixtures(c) {
  const intent=c.commandIntent.parse({schema_version:'execution.capital-intent.v2',
    workspace_id:'TEST_ONLY:workspace',resource:{kind:'PORTFOLIO',id:'TEST_ONLY:portfolio'},
    environment:'paper',expected_policy_revision:'TEST_ONLY:policy1',business_payload:{
      schema_version:'pma.capital-command.v1.1',operation:'TOP_UP',idempotency_key:'TEST_ONLY:key-0001',
      recipient_kind:'PORTFOLIO',currency:'USDT',expected_versions:{budget:'9007199254740993',source:'2',parent:'3'},
      reason:'TEST_ONLY component fixture',amount:'100.000000000000000001'}});
  const stored=c.commandStatus.parse({schema_version:'portal.execution.command-status.v1',
    command_id:'ecm_00000000000000000000000000000001',operation:'TOP_UP',
    resource:{kind:'PORTFOLIO',id:'TEST_ONLY:portfolio'},environment:'paper',profile_ref:'TEST_ONLY:paper',
    delivery:'ACKNOWLEDGED',business:{state:'UNKNOWN',receipt_ref:null,source_event_ref:null,revision:null,amounts:null},
    projection:'CATCHING_UP',venue:'UNKNOWN',next_action:'QUERY_SAME_INTENT',
    created_at_ms:1792100000000,updated_at_ms:1792100000000,authority:'TEST_ONLY'});
  // BE-P13: a source-REJECTED outcome. The published source result carries a state and an amount
  // partition but NO reason, so source_rejection is NOT_PUBLISHED, never a guess. The venue is
  // NOT_APPLICABLE for a capital command that never reached one.
  const rejected=c.commandStatus.parse({...stored,command_id:'ecm_00000000000000000000000000000002',delivery:'ACKNOWLEDGED',
    business:{state:'REJECTED',receipt_ref:'TEST_ONLY:receipt-2',source_event_ref:'TEST_ONLY:event-2',revision:'2',
      amounts:{requested:'100.000000000000000001',applied:'0',pending:'0',cancelled:'0',rejected:'100.000000000000000001'}},
    projection:'CURRENT',venue:'NOT_APPLICABLE',next_action:'REVIEW_RECEIPT',updated_at_ms:1792100000500});
  const currency=intent.business_payload.currency;
  return {lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',intent,
    preview_blocked:c.commandPreview.parse({schema_version:'portal.execution.command-preview.v1',allowed:false,
      reason_code:'COMMAND_RELAY_NOT_QUALIFIED',preview_digest:null,expires_at_ms:null,profile_ref:null,
      approval_required:null,approval_gate:null,cost_impact:{state:'NOT_PUBLISHED',reason:'NO_COST_OR_IMPACT_SOURCE'},
      business_applied:false,reserved:false}),
    preview_allowed:c.commandPreview.parse({schema_version:'portal.execution.command-preview.v1',allowed:true,
      reason_code:null,preview_digest:'sha256:'+'a'.repeat(64),expires_at_ms:1792100060000,profile_ref:'TEST_ONLY:paper',
      approval_required:false,approval_gate:null,cost_impact:{state:'NOT_PUBLISHED',reason:'NO_COST_OR_IMPACT_SOURCE'},
      business_applied:false,reserved:false}),
    ack_only:c.toPublicCommandStatus(stored,currency),
    rejected:c.toPublicCommandStatus(rejected,currency),
    submit_first:c.submitCommandStatus.parse({...c.toPublicCommandStatus(stored,currency),replayed:false}),
    submit_replayed:c.submitCommandStatus.parse({...c.toPublicCommandStatus(stored,currency),replayed:true}),
    stored_ack_only:stored};
}
