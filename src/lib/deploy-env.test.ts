import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'scripts', 'deploy-env.sh');

function runDeployEnv(input: string, initialEnv = '') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'anichin-deploy-env-'));
  const envFile = path.join(directory, '.env');
  if (initialEnv) writeFileSync(envFile, initialEnv, { mode: 0o600 });

  const result = spawnSync('sh', [scriptPath], {
    cwd: repoRoot,
    env: { ...process.env, ENV_FILE: envFile },
    input,
    encoding: 'utf8',
  });
  const fileContent = readFileSync(envFile, 'utf8');
  const fileMode = statSync(envFile).mode & 0o777;
  rmSync(directory, { recursive: true, force: true });
  return { result, fileContent, fileMode };
}

describe('scripts/deploy-env.sh — safe Compose .env serialization', () => {
  it('quotes and escapes special secret characters without printing the value', () => {
    const secret = 'p $word# quoted "x" \\ tail';
    const encoded = Buffer.from(secret).toString('base64');
    const { result, fileContent, fileMode } = runDeployEnv(`SMTP_PASS_B64=${encoded}\n`);

    expect(result.status).toBe(0);
    expect(fileContent).toBe('SMTP_PASS="p \\$word# quoted \\"x\\" \\\\ tail"\n');
    expect(fileMode).toBe(0o600);
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });

  it('updates only the requested key and preserves unrelated local settings', () => {
    const encoded = Buffer.from('replacement $secret').toString('base64');
    const { result, fileContent } = runDeployEnv(
      `SMTP_PASS_B64=${encoded}\n`,
      'SMTP_PASS="old value"\nKEEP_LOCAL=yes\n',
    );

    expect(result.status).toBe(0);
    expect(fileContent).toBe('SMTP_PASS="replacement \\$secret"\nKEEP_LOCAL=yes\n');
  });

  it('rejects decoded line breaks before they can inject another .env key', () => {
    const encoded = Buffer.from('first line\nINJECTED=value').toString('base64');
    const initialEnv = 'SMTP_PASS="old value"\n';
    const { result, fileContent } = runDeployEnv(`SMTP_PASS_B64=${encoded}\n`, initialEnv);

    expect(result.status).toBe(1);
    expect(fileContent).toBe(initialEnv);
    expect(fileContent).not.toContain('INJECTED');
    expect(result.stderr).toContain('CR, LF, atau NUL');
  });

  it('rejects invalid base64 without modifying the existing file', () => {
    const initialEnv = 'SMTP_PASS="old value"\n';
    const { result, fileContent } = runDeployEnv('SMTP_PASS_B64=%%%\n', initialEnv);

    expect(result.status).toBe(1);
    expect(fileContent).toBe(initialEnv);
    expect(result.stderr).toContain('bukan base64 valid');
  });
});
