import { createRequire } from 'node:module';

import publicEntry from './public-entry.js';

const { name, version } = createRequire(import.meta.url)('../package.json') as {
  name: string;
  version: string;
};

export default {
  meta: { name, version },
  rules: { 'public-entry': publicEntry },
};
