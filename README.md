# Night City Agents

Event-driven AI code review agent built on [Argo Workflows](https://argoproj.github.io/workflows/) and [Argo Events](https://argoproj.github.io/argo-events/), deployed to Kubernetes via Docker Desktop.

A merge request webhook arrives, Argo Events triggers an Argo Workflow, the workflow runs an LLM-powered code review agent, and the agent posts its review comment back to a simulated GitLab API.

This project serves as a base for exploring different agent deployment strategies described in the [Seven Hosting Patterns for AI Agents](/posts/2026-03-01-agent-hosting-patterns/) post.

## Architecture

```
                    ┌──────────────┐
                    │  Simulated   │
  curl/simulate ──> │   Webhook    │
                    │   (MR event) │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Webhook    │
                    │   Gateway    │ (:3002)
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Argo Events  │
                    │ EventSource  │ (webhook :12000)
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Argo Events  │
                    │   Sensor     │
                    └──────┬───────┘
                           │ submits
                           ▼
                    ┌──────────────┐
                    │    Argo      │
                    │  Workflow    │
                    │ (review pod) │
                    └──────┬───────┘
                           │ POST /notes
                           ▼
                    ┌──────────────┐
                    │  GitLab Sim  │ (:3001)
                    │ (logs review │
                    │  to terminal)│
                    └──────────────┘
```

## Components

| Service | Description | Port |
|---------|-------------|------|
| **GitLab Simulator** | Receives review comments via GitLab-compatible REST API, logs them to terminal | 3001 |
| **Webhook Gateway** | Receives MR webhook events, forwards to Argo Events (or submits workflows directly as fallback) | 3002 |
| **Review Agent** | LLM-powered changeset analyzer. Runs as an Argo Workflow step, posts review back to GitLab | - |

## Prerequisites

- Docker Desktop with Kubernetes enabled
- `kubectl` configured to use `docker-desktop` context
- `just` command runner
- `pnpm`
- `ANTHROPIC_API_KEY` for the review agent

## Quick Start

```bash
# Install Argo Workflows + Argo Events
just setup-argo

# Install Node dependencies and build
just install
just build

# Create the API key secret
just create-secret

# Deploy everything to the cluster
just deploy

# Fire a simulated merge request webhook
just simulate
```

## Watching the Demo

```bash
# In terminal 1: watch workflow executions
just watch-workflows

# In terminal 2: tail the GitLab sim logs to see the review comment
just logs-gitlab

# In terminal 3: fire the webhook
just simulate
```

## Local Development (no Kubernetes)

You can run the services locally for development without Kubernetes:

```bash
# Terminal 1: GitLab simulator
just dev-gitlab

# Terminal 2: Webhook gateway (will fallback to direct workflow submission)
just dev-gateway

# Terminal 3: Simulate a webhook
pnpm run simulate

# Or run the agent directly with a payload
EVENT_PAYLOAD='{"object_kind":"merge_request",...}' just dev-agent
```

## Project Structure

```
night-city-agents/
  src/
    shared/types.ts              # Domain types shared across services
    gitlab-sim/server.ts         # Simulated GitLab API server
    webhook-gateway/server.ts    # Webhook receiver + Argo Events forwarder
    agent/review.ts              # LLM changeset review agent
    simulate-webhook.ts          # CLI to fire a test MR event
  k8s/
    base/
      namespace.yaml             # night-city namespace
      secrets.yaml               # API key secret (placeholder)
      gitlab-sim.yaml            # GitLab sim deployment + service
      webhook-gateway.yaml       # Gateway deployment + NodePort service
    argo-workflows/
      changeset-review-template.yaml  # WorkflowTemplate for review agent
    argo-events/
      event-source.yaml          # Webhook EventSource
      sensor.yaml                # Sensor that triggers review workflow
      rbac.yaml                  # ServiceAccount + RBAC for sensor
  scripts/
    setup-argo.sh                # One-time Argo cluster setup
  Dockerfile                     # Multi-stage build for all services
  justfile                       # Task runner
```
