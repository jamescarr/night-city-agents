/**
 * Night City Webhook Gateway
 *
 * Receives GitLab merge request webhook events and forwards them to
 * Argo Events' webhook EventSource. In a production setup, this
 * gateway would handle authentication, validation, and event
 * transformation before passing events into the cluster.
 *
 * Flow:
 *   GitLab (or simulator) --> Webhook Gateway --> Argo Events EventSource
 *                                                        |
 *                                                   Sensor triggers
 *                                                   Argo Workflow
 *
 * When running outside Kubernetes (local dev), the gateway can also
 * submit Argo Workflows directly via the Argo Server API as a fallback.
 *
 * Endpoints:
 *   POST /webhook/merge-request  - Receive MR event, forward to Argo Events
 *   GET  /health                 - Health check
 */

import express from 'express';
import type { MergeRequestEvent } from '../shared/types.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = parseInt(process.env.PORT || '3002', 10);

// Argo Events webhook EventSource endpoint (inside k8s)
const ARGO_EVENTS_URL = process.env.ARGO_EVENTS_URL || 'http://webhook-eventsource-svc.argo-events:12000/merge-request';

// Argo Server API (fallback for direct workflow submission)
const ARGO_SERVER_URL = process.env.ARGO_SERVER_URL || 'http://argo-server.argo:2746';

const DIM = '\x1b[2m';
const BRIGHT = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

app.post('/webhook/merge-request', async (req, res) => {
  const event = req.body as MergeRequestEvent;

  const mrTitle = event.object_attributes?.title || 'Unknown';
  const mrIid = event.object_attributes?.iid || 0;
  const action = event.object_attributes?.action || 'unknown';
  const project = event.project?.name || 'unknown';
  const author = event.object_attributes?.author?.handle || 'unknown';
  const fileCount = event.changes?.length || 0;

  console.log('');
  console.log(`${CYAN}>>> INCOMING WEBHOOK${RESET}`);
  console.log(`${DIM}  Project:${RESET} ${project}`);
  console.log(`${DIM}  MR:${RESET}      !${mrIid} - ${mrTitle}`);
  console.log(`${DIM}  Action:${RESET}  ${action}`);
  console.log(`${DIM}  Author:${RESET}  ${author}`);
  console.log(`${DIM}  Files:${RESET}   ${fileCount} changed`);

  // Only process opens and updates
  if (action !== 'open' && action !== 'update') {
    console.log(`${YELLOW}  SKIPPED: action '${action}' does not require review${RESET}`);
    res.status(200).json({ status: 'skipped', reason: `action '${action}' ignored` });
    return;
  }

  // Forward to Argo Events webhook EventSource
  try {
    console.log(`${DIM}  Forwarding to Argo Events...${RESET}`);

    const response = await fetch(ARGO_EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (response.ok) {
      console.log(`${GREEN}  DISPATCHED to Argo Events${RESET}`);
      res.status(202).json({ status: 'dispatched', target: 'argo-events' });
    } else {
      const body = await response.text();
      console.log(`${RED}  Argo Events returned ${response.status}: ${body}${RESET}`);
      console.log(`${YELLOW}  Falling back to direct Argo Workflow submission...${RESET}`);
      await submitWorkflowDirect(event, res);
    }
  } catch (error) {
    console.log(`${YELLOW}  Argo Events unreachable, falling back to direct submission...${RESET}`);
    await submitWorkflowDirect(event, res);
  }
});

async function submitWorkflowDirect(event: MergeRequestEvent, res: express.Response) {
  const workflowPayload = {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Workflow',
    metadata: {
      generateName: 'changeset-review-',
      namespace: 'argo',
      labels: {
        'app.kubernetes.io/part-of': 'night-city-agents',
        'night-city/mr-iid': String(event.object_attributes.iid),
      },
    },
    spec: {
      workflowTemplateRef: { name: 'changeset-review' },
      arguments: {
        parameters: [
          { name: 'event-payload', value: JSON.stringify(event) },
        ],
      },
    },
  };

  try {
    const response = await fetch(`${ARGO_SERVER_URL}/api/v1/workflows/argo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: workflowPayload }),
    });

    if (response.ok) {
      const result = await response.json() as any;
      console.log(`${GREEN}  SUBMITTED workflow: ${result.metadata?.name || 'unknown'}${RESET}`);
      res.status(202).json({ status: 'dispatched', target: 'argo-server', workflow: result.metadata?.name });
    } else {
      const body = await response.text();
      console.log(`${RED}  Argo Server error (${response.status}): ${body}${RESET}`);
      res.status(502).json({ status: 'error', message: 'Failed to submit workflow' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`${RED}  Failed to reach Argo Server: ${msg}${RESET}`);
    res.status(502).json({ status: 'error', message: msg });
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'operational', service: 'night-city-webhook-gateway' });
});

app.listen(PORT, () => {
  console.log(`${CYAN}${'='.repeat(50)}${RESET}`);
  console.log(`${BRIGHT}${CYAN}  NIGHT CITY WEBHOOK GATEWAY${RESET}`);
  console.log(`${DIM}  NetWatch DevOps // Event Ingress Controller${RESET}`);
  console.log(`${CYAN}${'='.repeat(50)}${RESET}`);
  console.log('');
  console.log(`  ${GREEN}ONLINE${RESET} on port ${PORT}`);
  console.log(`  POST /webhook/merge-request`);
  console.log('');
  console.log(`${DIM}  Argo Events:${RESET}  ${ARGO_EVENTS_URL}`);
  console.log(`${DIM}  Argo Server:${RESET}  ${ARGO_SERVER_URL}`);
  console.log('');
  console.log(`${DIM}  Waiting for merge request webhooks...${RESET}`);
  console.log('');
});
