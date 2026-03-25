import './instrument.js';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  execSync('npx prisma migrate deploy', {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  console.error(`DB migration failed: ${err.message}. Check DATABASE_URL and retry.`);
  process.exit(1);
}

// Dynamic import ensures app module (and Prisma client) loads after migration completes
const { default: app } = await import('./app.js');
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Coldbase server] Listening on http://localhost:${PORT}`);
});
