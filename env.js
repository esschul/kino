import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function applyEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadEnvFile(callerModuleUrl) {
  const cwdEnv = path.resolve(process.cwd(), '.env');
  applyEnvFile(cwdEnv);

  if (!callerModuleUrl) {
    return;
  }

  const callerPath = fileURLToPath(callerModuleUrl);
  const callerDir = path.dirname(callerPath);
  const moduleEnv = path.resolve(callerDir, '.env');

  if (moduleEnv !== cwdEnv) {
    applyEnvFile(moduleEnv);
  }
}
