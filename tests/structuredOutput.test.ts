import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { outputSchema, decodeOptionalNulls, validationDetails } from '../server/structuredOutput';
describe('structured reviewer output', () => {
  const schema = z.object({
    required: z.string(),
    note: z.string().optional(),
    revised: z.object({ flag: z.boolean().optional() }).nullable(),
  });
  it('constrains every object property while representing optional values as nullable', () => {
    const result = outputSchema(schema) as any;
    expect(result.additionalProperties).toBe(false);
    expect(result.required).toEqual(['required', 'note', 'revised']);
    expect(result.properties.note).toEqual({ type: ['string', 'null'] });
  });
  it('only decodes optional nulls, preserving real nullable and invalid required fields', () => {
    expect(
      schema.parse(
        decodeOptionalNulls(schema, { required: 'ok', note: null, revised: { flag: null } }),
      ),
    ).toEqual({ required: 'ok', note: undefined, revised: { flag: undefined } });
    expect(
      schema.parse(decodeOptionalNulls(schema, { required: 'ok', note: null, revised: null }))
        .revised,
    ).toBeNull();
    expect(
      schema.safeParse(decodeOptionalNulls(schema, { required: null, note: null, revised: null }))
        .success,
    ).toBe(false);
  });
  it('reports exact field paths and limits for correction', () => {
    const result = z
      .object({ findings: z.array(z.object({ action: z.string().max(3) })) })
      .safeParse({ findings: [{ action: 'too long' }] });
    if (result.success) throw new Error('Expected validation failure');
    expect(validationDetails(result.error)).toContain('findings.0.action');
    expect(validationDetails(result.error)).toContain('3');
  });
  it('uses numeric exclusive bounds accepted by the transport', () => {
    const result = outputSchema(z.object({ page: z.number().int().positive() })) as any;
    expect(result.properties.page.exclusiveMinimum).toBe(0);
    expect(result.properties.page.minimum).toBeUndefined();
  });
});
