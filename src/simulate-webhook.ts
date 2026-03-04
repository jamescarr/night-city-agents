/**
 * Simulates a GitLab merge request webhook event.
 *
 * Sends a realistic MR event with a cyberpunk-themed changeset
 * to the webhook gateway, kicking off the full review pipeline.
 *
 * Usage:
 *   pnpm run simulate
 *   GATEWAY_URL=http://localhost:3002 pnpm run simulate
 */

import type { MergeRequestEvent } from './shared/types.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3002';

const event: MergeRequestEvent = {
  object_kind: 'merge_request',
  project: {
    id: 2077,
    name: 'neural-link-firmware',
    namespace: 'arasaka/implants',
    web_url: 'https://gitlab.arasaka.corp/implants/neural-link-firmware',
  },
  object_attributes: {
    iid: 42,
    title: 'feat: add biometric bypass for Kiroshi optics auth',
    description: [
      'Adds a new authentication bypass for Kiroshi optics firmware updates.',
      'This allows field operatives to flash firmware without corporate SSO',
      'when operating in low-connectivity zones (Badlands, combat zones).',
      '',
      'Closes IMPL-1337',
    ].join('\n'),
    source_branch: 'feature/kiroshi-bypass',
    target_branch: 'main',
    state: 'opened',
    action: 'open',
    author: {
      handle: 'v-merc',
      name: 'V',
    },
    url: 'https://gitlab.arasaka.corp/implants/neural-link-firmware/-/merge_requests/42',
  },
  changes: [
    {
      old_path: 'src/auth/kiroshi-auth.ts',
      new_path: 'src/auth/kiroshi-auth.ts',
      new_file: false,
      deleted_file: false,
      renamed_file: false,
      diff: `@@ -1,5 +1,7 @@
 import { BiometricScanner } from '../hardware/biometric.js';
 import { CorporateSSO } from '../auth/corporate-sso.js';
+import { FieldBypass } from '../auth/field-bypass.js';
+import { ZoneDetector } from '../hardware/zone-detector.js';

 export class KiroshiAuth {
   private scanner: BiometricScanner;
@@ -12,6 +14,22 @@
     return this.sso.validateToken(token);
   }

+  async authenticateFieldOp(operativeId: string): Promise<boolean> {
+    const zone = await ZoneDetector.getCurrentZone();
+
+    if (zone.connectivity === 'full') {
+      return this.authenticate(operativeId);
+    }
+
+    // Bypass corporate SSO in low-connectivity zones
+    const bypass = new FieldBypass(process.env.BYPASS_SECRET || 'default-key');
+    const biometric = await this.scanner.scan(operativeId);
+
+    if (!biometric.valid) {
+      throw new Error('Biometric scan failed');
+    }
+
+    return bypass.validate(operativeId, biometric.hash);
+  }
+
   async revokeAccess(operativeId: string): Promise<void> {`,
    },
    {
      old_path: 'src/auth/field-bypass.ts',
      new_path: 'src/auth/field-bypass.ts',
      new_file: true,
      deleted_file: false,
      renamed_file: false,
      diff: `@@ -0,0 +1,35 @@
+import crypto from 'crypto';
+
+/**
+ * Field bypass authentication for low-connectivity zones.
+ * Uses HMAC-based verification with a shared secret.
+ */
+export class FieldBypass {
+  private secret: string;
+
+  constructor(secret: string) {
+    this.secret = secret;
+  }
+
+  validate(operativeId: string, biometricHash: string): boolean {
+    const expected = crypto
+      .createHmac('sha256', this.secret)
+      .update(operativeId + biometricHash)
+      .digest('hex');
+
+    // Compare tokens
+    return expected === biometricHash;
+  }
+
+  generateToken(operativeId: string): string {
+    return crypto
+      .createHmac('sha256', this.secret)
+      .update(operativeId + Date.now().toString())
+      .digest('hex');
+  }
+
+  static isFieldZone(zone: string): boolean {
+    const fieldZones = ['badlands', 'combat_zone', 'pacifica', 'biotechnica_flats'];
+    return fieldZones.includes(zone.toLowerCase());
+  }
+}`,
    },
    {
      old_path: 'tests/auth/kiroshi-auth.test.ts',
      new_path: 'tests/auth/kiroshi-auth.test.ts',
      new_file: false,
      deleted_file: false,
      renamed_file: false,
      diff: `@@ -45,4 +45,18 @@
     expect(result).toBe(false);
   });
+
+  describe('authenticateFieldOp', () => {
+    it('should use SSO in full connectivity zones', async () => {
+      ZoneDetector.getCurrentZone = async () => ({ connectivity: 'full', name: 'city_center' });
+      const result = await auth.authenticateFieldOp('OP-001');
+      expect(mockSSO.validateToken).toHaveBeenCalled();
+    });
+
+    it('should use field bypass in low connectivity zones', async () => {
+      ZoneDetector.getCurrentZone = async () => ({ connectivity: 'limited', name: 'badlands' });
+      const result = await auth.authenticateFieldOp('OP-001');
+      expect(result).toBe(true);
+    });
+  });
 });`,
    },
  ],
};

async function main() {
  const CYAN = '\x1b[36m';
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const DIM = '\x1b[2m';
  const BRIGHT = '\x1b[1m';
  const RESET = '\x1b[0m';

  console.log('');
  console.log(`${CYAN}${'='.repeat(50)}${RESET}`);
  console.log(`${BRIGHT}${CYAN}  SIMULATING MERGE REQUEST WEBHOOK${RESET}`);
  console.log(`${CYAN}${'='.repeat(50)}${RESET}`);
  console.log('');
  console.log(`${DIM}  Target:${RESET}  ${GATEWAY_URL}/webhook/merge-request`);
  console.log(`${DIM}  Project:${RESET} ${event.project.namespace}/${event.project.name}`);
  console.log(`${DIM}  MR:${RESET}      !${event.object_attributes.iid} - ${event.object_attributes.title}`);
  console.log(`${DIM}  Author:${RESET}  ${event.object_attributes.author.handle}`);
  console.log(`${DIM}  Files:${RESET}   ${event.changes.length} changed`);
  console.log('');

  try {
    const response = await fetch(`${GATEWAY_URL}/webhook/merge-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gitlab-Event': 'Merge Request Hook',
        'X-Gitlab-Token': 'netwatch-secret',
      },
      body: JSON.stringify(event),
    });

    const body = await response.json();

    if (response.ok) {
      console.log(`${GREEN}  Webhook accepted (${response.status})${RESET}`);
      console.log(`${DIM}  Response: ${JSON.stringify(body)}${RESET}`);
    } else {
      console.log(`${RED}  Webhook rejected (${response.status})${RESET}`);
      console.log(`${DIM}  Response: ${JSON.stringify(body)}${RESET}`);
    }
  } catch (error) {
    console.error(`${RED}  Failed to send webhook: ${error instanceof Error ? error.message : error}${RESET}`);
    console.error('');
    console.error('  Make sure the webhook gateway is running:');
    console.error('    just dev-gateway');
    process.exit(1);
  }

  console.log('');
  console.log(`${CYAN}${'='.repeat(50)}${RESET}`);
}

main();
