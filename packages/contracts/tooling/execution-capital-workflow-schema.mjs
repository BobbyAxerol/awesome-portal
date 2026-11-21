/** Shared structural refinements for the SAME canonical WorkflowCapital Zod
 * contract in schema-only stories and the additive stored-command GET. Decimal
 * partition arithmetic/correlated context remain runtime obligations. */
export function capitalWorkflowSchemas(contract, json) {
  const schema = json(contract.workflowCapital);
  schema.properties.context = { $ref: '#/components/schemas/WorkflowContext' };
  schema.properties.status = { $ref: '#/components/schemas/CommandStatus' };
  const business = properties => ({ properties: { status: { properties: { business: { properties } } } } });
  return { WorkflowContext: json(contract.workflowContext), WorkflowCapital: { ...schema, allOf: [{
    if: business({ state: { const: 'UNKNOWN' } }),
    then: business(Object.fromEntries(['amounts', 'receipt_ref', 'source_event_ref', 'revision'].map(k => [k, { type: 'null' }]))),
    else: business(Object.fromEntries(['receipt_ref', 'source_event_ref', 'revision'].map(k => [k, { type: 'string' }]))),
  }, {
    if: { properties: { status: { properties: {
      operation: { not: { enum: ['ADJUST_TARGET_BUDGET', 'SET_ROOT_LIMIT'] } },
      business: { properties: { state: { not: { const: 'UNKNOWN' } } } },
    } } } },
    then: business({ amounts: { type: 'object' } }),
  }] } };
}
