import { CodexModel } from '../server/model.js';
import { z } from 'zod';
import { outputSchema, decodeOptionalNulls } from '../server/structuredOutput.js';
const model = new CodexModel();
const schema = z.object({ connected: z.boolean(), note: z.string().optional() });
try {
  const result = await model.complete(
    'Return connected=true and note=null. No tools.',
    outputSchema(schema),
  );
  console.log(schema.parse(decodeOptionalNulls(schema, JSON.parse(result.text))));
} finally {
  model.close();
}
