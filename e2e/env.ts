import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAGING_REF = 'pihibucdmdvmexxwxvws';
// package.json ha "type": "module": niente __dirname
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function readEnvFile(name: string): Record<string, string> {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

const appEnv = readEnvFile('.env.local');
const e2eEnv = readEnvFile('.env.e2e.local');

export const SUPABASE_URL = appEnv.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = appEnv.VITE_SUPABASE_ANON_KEY ?? '';
/** Chiave di localStorage dove supabase-js salva la sessione (default: sb-<ref>-auth-token). */
export const AUTH_STORAGE_KEY = `sb-${STAGING_REF}-auth-token`;

export function assertStaging() {
  if (!SUPABASE_URL.includes(STAGING_REF)) {
    throw new Error(
      `STOP: .env.local non punta allo staging (${STAGING_REF}). ` +
      'I test automatici muovono saldi e prenotazioni: si lanciano solo sullo staging.',
    );
  }
}

export type Role = 'mario' | 'luigi' | 'admin';

export function credentials(role: Role) {
  const prefix = `E2E_${role.toUpperCase()}`;
  const email = e2eEnv[`${prefix}_EMAIL`];
  const password = e2eEnv[`${prefix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Mancano ${prefix}_EMAIL / ${prefix}_PASSWORD in .env.e2e.local (vedi e2e/README.md).`);
  }
  return { email, password };
}

export const storageStatePath = (role: Role) => path.join(ROOT, 'e2e', '.auth', `${role}.json`);
