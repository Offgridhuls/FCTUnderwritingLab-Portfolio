import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { seedDocuments, specs, RULES, RULES_VERSION } from '../server/seed';
import { roles, roleNames, roleScopes } from '../shared/types';
import { coverageTopics, COVERAGE_VERSION } from '../shared/coverage';
import { reviewSchema, crossSchema, responseSchema, leadSchema } from '../server/workflow';
import { citationSchema } from '../server/evidence';
import { z } from 'zod';
import { outputSchema } from '../server/structuredOutput';

// Export only synthetic definitions. Never reads a user's database or session.
const root = resolve('backend/Underwriting.Infrastructure/Resources');
await mkdir(root, { recursive: true });
const documents = await seedDocuments(join(root, 'Seed'));
await writeFile(join(root, 'seed.json'), JSON.stringify(documents.map(document => ({
  ...document, file: `Seed/${document.id}.pdf`, reveal: !!specs.find(spec => spec.id === document.id)?.reveal,
})), null, 2));
await writeFile(join(root, 'reviewers.json'), JSON.stringify({
  roles, roleNames, roleScopes, coverageTopics, coverageVersion: COVERAGE_VERSION, rulesVersion: RULES_VERSION,
}, null, 2));
await writeFile(join(root, 'demonstration-rules.txt'), RULES);
await writeFile(join(root, 'review-output-schema.json'), JSON.stringify(outputSchema(reviewSchema), null, 2));
const schemas = {
  cross: crossSchema, response: responseSchema, lead: leadSchema,
  peer: z.object({ responses: z.array(responseSchema.extend({ findingId: z.string() })).min(1).max(12) }),
  audit: z.object({ questions: z.array(z.object({ topicId: z.string(), text: z.string().min(1).max(1600), citations: z.array(citationSchema).max(5) })).max(24) }),
};
for (const [name, schema] of Object.entries(schemas))
  await writeFile(join(root, `${name}-output-schema.json`), JSON.stringify(outputSchema(schema), null, 2));
const workflowSource = await readFile('server/workflow.ts', 'utf8');
const policy = workflowSource.split('${RULES}\\n')[1]?.split('\\nDETERMINISTIC CHECKS:')[0];
if (!policy) throw new Error('Reviewer policy not found; inspect the source before regenerating.');
await writeFile(join(root, 'review-policy-v1.txt'), policy.replaceAll('\\n', '\n'));
const coverageSource = await readFile('server/coverage.ts', 'utf8');
const outcomePolicy = coverageSource.split('return ` OUTCOME CONTRACT: ')[1]?.split('REQUIRED COVERAGE TOPICS:')[0];
if (!outcomePolicy) throw new Error('Coverage outcome policy not found.');
await writeFile(join(root, 'coverage-policy-v1.txt'), outcomePolicy.trimEnd() + '\n');
console.log('Exported synthetic seed documents and versioned reviewer definitions.');
