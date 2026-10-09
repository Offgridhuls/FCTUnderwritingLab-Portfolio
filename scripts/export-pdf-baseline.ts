import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { extractPdf } from '../server/evidence';
import { extractDetails, inferDocumentKind } from '../server/details';

const paths = [
  ...(await readdir('backend/Underwriting.Infrastructure/Resources/Seed')).filter(name => name.endsWith('.pdf')).map(name => 'backend/Underwriting.Infrastructure/Resources/Seed/' + name),
  ...(await readdir('output/pdf/complex-case/upload')).filter(name => name.endsWith('.pdf')).map(name => 'output/pdf/complex-case/upload/' + name),
  'output/pdf/complex-case/corrected/09-corrected-evidence-pack.pdf',
  'output/pdf/birch-quay-case/Birch-Quay-Case-Documents.pdf',
  'output/pdf/birch-quay-case/corrected/Birch-Quay-Corrective-Evidence.pdf',
];
const fixtures = [];
for (const path of paths) {
  const evidence = await extractPdf(new Uint8Array(await readFile(path)));
  const document = { id: path, title: path.split('/').at(-1)!, kind: inferDocumentKind(path, evidence.pages), ...evidence, file: path, createdAt: '' };
  fixtures.push({ path, ...evidence, details: extractDetails([document], 1) });
}
await mkdir('tests/fixtures', { recursive: true });
await writeFile(join('tests/fixtures', 'pdf-baseline.json'), JSON.stringify(fixtures, null, 2));
console.log(`Recorded ${fixtures.length} PDF extraction fixtures from the original implementation.`);
