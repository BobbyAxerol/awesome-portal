/** B8/B9 additive pair annotations; retain every unrelated contract byte. */
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const path = new URL('openapi/research-compare.openapi.json', root);
const original = readFileSync(path, 'utf8');
const source = JSON.parse(readFileSync(new URL('openapi/research-evidence.openapi.json', root), 'utf8')).components.schemas;
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const nullable = value => ({ anyOf: [value, { type: 'null' }] });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const enriched = source.EnrichedAnalysis.properties;
const components = Object.fromEntries(Object.entries(source).filter(([name]) => name.startsWith('EnrichedAnalysis')));
components.CompareChartAnnotation = object({
  run_id: ref('RunId'), availability: ref('Availability'), input_digest: nullable(ref('Digest')),
  scope: nullable(enriched.scope), all_time_metrics: nullable(enriched.facts.properties.metrics),
  drawdown_episodes: nullable(enriched.drawdown_episodes),
  month_extrema: object({ availability: ref('Availability'),
    definition_id: { const: 'ALL_RETAINED_OOS_MONTHS_MAX_MIN_RETURN_V1' }, includes_partial_months: { const: true },
    source_period_count: nullable({ type: 'integer', minimum: 0 }),
    best: nullable(enriched.monthly_returns.properties.values.items), worst: nullable(enriched.monthly_returns.properties.values.items),
  }),
});
const document = JSON.parse(original), pair = document.components.schemas.PairData;
pair.properties.chart_annotations = { type: 'array', minItems: 2, maxItems: 2, items: ref('CompareChartAnnotation') };
let next = original.replace(/^      "(?:EnrichedAnalysis[^"\n]*|CompareChartAnnotation)":.*\n/gm, '');
next = next.replace('"schemas": {\n', '"schemas": {\n' + Object.entries(components)
  .map(([name, schema]) => `      "${name}": ${JSON.stringify(schema)},\n`).join(''));
const line = /^      "PairData": [^\n]+,$/m;
if (!line.test(next)) throw new Error('Missing named PairData component');
next = next.replace(line, () => `      "PairData": ${JSON.stringify(pair)},`);
if (next !== original) {
  if (process.argv.includes('--check')) throw new Error('Compare chart contract drift');
  writeFileSync(path, next);
}
console.log('Compare pair chart annotations generated.');
