import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function outputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const result = zodToJsonSchema(schema, {
    target: 'openAi',
    $refStrategy: 'none',
    pipeStrategy: 'input',
  }) as Record<string, unknown>;
  // The converter's OpenAI target uses draft-04 boolean exclusive bounds;
  // Codex's response schema expects modern numeric exclusive bounds.
  function modernize(node: any) {
    if (!node || typeof node !== 'object') return;
    for (const bound of ['Minimum', 'Maximum']) {
      const key = 'exclusive' + bound;
      const inclusive = bound.toLowerCase();
      if (typeof node[key] === 'boolean') {
        if (node[key]) {
          node[key] = node[inclusive];
          delete node[inclusive];
        } else delete node[key];
      }
    }
    delete node.$schema;
    Object.values(node).forEach(modernize);
  }
  modernize(result);
  return result;
}

// Structured output represents omitted optional fields as null. Only remove null
// where the original validator allows omission; required nulls still fail.
export function decodeOptionalNulls(schema: z.ZodTypeAny, value: unknown): unknown {
  if (schema instanceof z.ZodOptional) {
    return value === null ? undefined : decodeOptionalNulls(schema.unwrap(), value);
  }
  if (schema instanceof z.ZodNullable)
    return value === null ? null : decodeOptionalNulls(schema.unwrap(), value);
  if (schema instanceof z.ZodEffects) return decodeOptionalNulls(schema.innerType(), value);
  if (schema instanceof z.ZodPipeline) return decodeOptionalNulls(schema._def.in, value);
  if (
    schema instanceof z.ZodObject &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        schema.shape[key] ? decodeOptionalNulls(schema.shape[key], v) : v,
      ]),
    );
  }
  if (schema instanceof z.ZodArray && Array.isArray(value))
    return value.map((v) => decodeOptionalNulls(schema.element, v));
  return value;
}

export function validationDetails(error: z.ZodError): string {
  // Field paths and validator messages only. Never persist raw model output.
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || 'response'}: ${i.message}`)
    .join('; ');
}
