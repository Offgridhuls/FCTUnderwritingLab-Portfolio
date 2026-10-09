import { createInterface } from 'node:readline';
import { FixtureModel } from '../fake-model';

const model = new FixtureModel();
model.delay = Number(process.env.FCT_FIXTURE_DELAY || 80);
// Zod's strict output schema represents optional fields with explicit nulls.
function completeOptionalFields(value: unknown, schema: any): void {
  for (const alternative of schema.anyOf || []) completeOptionalFields(value, alternative);
  if (Array.isArray(value))
    value.forEach((item) => completeOptionalFields(item, schema.items || {}));
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [name, child] of Object.entries(schema.properties || {})) {
      if (!(name in record)) record[name] = null;
      else completeOptionalFields(record[name], child);
    }
  }
}
async function respond(line: string) {
  let id: number | undefined;
  try {
    const request = JSON.parse(line);
    id = request.id;
    // Keep this adapter using the same deterministic model as the original browser suite.
    const prompt = request.prompt.replace(/\.\s+Raise 0 to 2/g, '. Raise 0 to 2');
    const result = await model.complete(prompt);
    const output = JSON.parse(result.text);
    completeOptionalFields(output, request.schema);
    process.stdout.write(JSON.stringify({ id, ...result, text: JSON.stringify(output) }) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ id, error: error instanceof Error ? error.message : String(error) }) + '\n',
    );
  }
}
// Match production concurrency; C# bounds calls process-wide and correlates every response.
let ordered = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  // Exact cross-language payload checks use deterministic completion order, without sorting responses.
  if (process.env.FCT_FIXTURE_SERIAL === '1') ordered = ordered.then(() => respond(line));
  else void respond(line);
});
