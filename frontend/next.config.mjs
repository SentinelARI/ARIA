import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));

export default {
  outputFileTracingRoot: path.join(frontendDirectory, '..')
};
