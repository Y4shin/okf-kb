// remote-deployment-doc.test.ts — content/structure test for the deployment guide.
// This is the auto-gate for docs/remote-deployment.md: it asserts the required
// sections are present (recommended path, secondary path, config env, client
// side, threat model, governance, capabilities check). Human review of the
// guide's usability is a follow-up (mode: hitl).

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'remote-deployment.md');

let docContent: string;
beforeAll(async () => {
  docContent = await readFile(DOC_PATH, 'utf-8');
});

describe('docs/remote-deployment.md — content/structure', () => {
  it('loads the doc (file exists)', async () => {
    const content = await readFile(DOC_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  // --- Recommended path: systemd + caddy/nginx with TLS ---
  it('has the recommended path section (systemd + caddy/nginx with TLS)', () => {
    expect(docContent).toMatch(/systemd/i);
    expect(docContent).toMatch(/caddy/i);
    expect(docContent).toMatch(/nginx/i);
    expect(docContent).toMatch(/TLS/i);
    expect(docContent).toMatch(/reverse_proxy/i);
    expect(docContent).toMatch(/Let'?s Encrypt/i);
  });

  it('includes a caddyfile snippet', () => {
    expect(docContent).toMatch(/reverse_proxy\s+127\.0\.0\.1:30700/);
  });

  it('includes a systemd unit snippet', () => {
    expect(docContent).toMatch(/ExecStart/);
    expect(docContent).toMatch(/KB_TOKEN/);
    expect(docContent).toMatch(/KB_HOME/);
    expect(docContent).toMatch(/daemon/i);
  });

  // --- Secondary path: direct daemon TLS (KB_DAEMON_TLS_*) ---
  it('has the secondary path section (KB_DAEMON_TLS_CERT/KEY)', () => {
    expect(docContent).toMatch(/KB_DAEMON_TLS_CERT/);
    expect(docContent).toMatch(/KB_DAEMON_TLS_KEY/);
  });

  it('notes the safety gate (refuses non-localhost bind without TLS or escape hatch)', () => {
    expect(docContent).toMatch(/Refusing to bind non-localhost/i);
    expect(docContent).toMatch(/reverse proxy/i);
    expect(docContent).toMatch(/KB_DAEMON_TLS_CERT/);
    expect(docContent).toMatch(/KB_ALLOW_REMOTE_INSECURE/);
  });

  // --- Config env ---
  it('documents the config env vars', () => {
    expect(docContent).toMatch(/KB_DAEMON_HOST/);
    expect(docContent).toMatch(/127\.0\.0\.1/);
    expect(docContent).toMatch(/KB_TOKEN/);
    expect(docContent).toMatch(/KB_HOME/);
    expect(docContent).toMatch(/KB_PORT/);
    expect(docContent).toMatch(/30700/);
    expect(docContent).toMatch(/KB_ALLOW_REMOTE_INSECURE/);
  });

  // --- Client side ---
  it('documents the client-side config (KB_URL + isRemoteKb → kb_put/kb_delete)', () => {
    expect(docContent).toMatch(/KB_URL/);
    expect(docContent).toMatch(/isRemoteKb/);
    expect(docContent).toMatch(/kb_put/);
    expect(docContent).toMatch(/kb_delete/);
  });

  it('explains local vs remote authoring', () => {
    expect(docContent).toMatch(/native.*write.*edit/i);
    expect(docContent).toMatch(/kb_put/);
    expect(docContent).toMatch(/local disk/i);
    expect(docContent).toMatch(/daemon.*bundle/i);
  });

  // --- Threat model ---
  it('has the threat model section', () => {
    expect(docContent).toMatch(/Bearer token is auth/i);
    expect(docContent).toMatch(/not network security/i);
    expect(docContent).toMatch(/TLS is the network layer/i);
    expect(docContent).toMatch(/sniffable/i);
  });

  it('notes remote = network-exposed KB (strong token + TLS + private network/VPN)', () => {
    expect(docContent).toMatch(/network-exposed/i);
    expect(docContent).toMatch(/strong token/i);
    expect(docContent).toMatch(/VPN/i);
  });

  // --- Governance ---
  it('has the governance section', () => {
    expect(docContent).toMatch(/edit-anything/i);
    expect(docContent).toMatch(/git/i);
    expect(docContent).toMatch(/never self-promote/i);
    expect(docContent).toMatch(/deprecate with consent/i);
    expect(docContent).toMatch(/provenance/i);
  });

  // --- Capabilities check ---
  it('documents the GET / capabilities check', () => {
    expect(docContent).toMatch(/GET \//);
    expect(docContent).toMatch(/capabilities/i);
    expect(docContent).toMatch(/groups/i);
    expect(docContent).toMatch(/not.*Bearer-gated/i);
  });
});
