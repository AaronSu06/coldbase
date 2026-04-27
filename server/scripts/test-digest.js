// Run: node --env-file=.env scripts/test-digest.js
import { sendDigests } from '../cron/digestCron.js';
await sendDigests();
process.exit(0);
