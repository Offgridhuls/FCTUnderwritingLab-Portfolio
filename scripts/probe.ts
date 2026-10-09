import { CodexModel } from '../server/model.js';
const model = new CodexModel();
try {
  console.log(
    await model.complete('Return exactly {"connected":true,"model":"Terra"}. Do not use tools.'),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  model.close();
}
