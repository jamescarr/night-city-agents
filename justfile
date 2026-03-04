# Night City Agents - Event-Driven AI on Argo Workflows

set dotenv-load := true

default:
    @just --list

# =============================================================================
# Development (local, no Kubernetes)
# =============================================================================

# Install dependencies
install:
    pnpm install

# Build TypeScript
build-ts:
    pnpm build

# Run the GitLab simulator locally
dev-gitlab:
    pnpm run dev:gitlab

# Run the webhook gateway locally
dev-gateway:
    pnpm run dev:gateway

# Run the review agent locally (needs EVENT_PAYLOAD env var)
dev-agent:
    pnpm run agent

# Type check
typecheck:
    pnpm typecheck

# =============================================================================
# Docker
# =============================================================================

# Build the Docker image (used by all k8s services)
build:
    docker build -t night-city-agents:latest .

# =============================================================================
# Kubernetes Setup
# =============================================================================

# Install Argo Workflows + Argo Events onto the cluster
setup-argo:
    ./scripts/setup-argo.sh

# Create the API key secret (interactive)
create-secret:
    @echo "Enter your Anthropic API key:"
    @read -s key && kubectl create secret generic agent-secrets \
      --namespace argo \
      --from-literal=anthropic-api-key="$$key" \
      --dry-run=client -o yaml | kubectl apply -f -
    @echo "Secret created/updated in argo namespace"

# =============================================================================
# Deploy
# =============================================================================

# Deploy all Night City services to Kubernetes
deploy: build
    kubectl apply -f k8s/base/namespace.yaml
    kubectl apply -f k8s/base/gitlab-sim.yaml
    kubectl apply -f k8s/base/webhook-gateway.yaml
    kubectl apply -f k8s/argo-workflows/changeset-review-template.yaml
    kubectl apply -f k8s/argo-events/rbac.yaml
    kubectl apply -f k8s/argo-events/event-source.yaml
    kubectl apply -f k8s/argo-events/sensor.yaml
    @echo ""
    @echo "Deployed. Waiting for pods..."
    @sleep 5
    @kubectl get pods -n night-city
    @kubectl get pods -n argo-events -l eventsource-name=webhook-eventsource

# Remove all Night City resources from the cluster
undeploy:
    kubectl delete -f k8s/argo-events/sensor.yaml --ignore-not-found
    kubectl delete -f k8s/argo-events/event-source.yaml --ignore-not-found
    kubectl delete -f k8s/argo-events/rbac.yaml --ignore-not-found
    kubectl delete -f k8s/argo-workflows/changeset-review-template.yaml --ignore-not-found
    kubectl delete -f k8s/base/webhook-gateway.yaml --ignore-not-found
    kubectl delete -f k8s/base/gitlab-sim.yaml --ignore-not-found

# =============================================================================
# Demo / Testing
# =============================================================================

# Simulate a merge request webhook (via port-forwarded gateway)
simulate:
    GATEWAY_URL=http://localhost:30002 pnpm run simulate

# Port-forward the Argo UI
argo-ui:
    @echo "Argo UI at https://localhost:2746"
    kubectl -n argo port-forward svc/argo-server 2746:2746

# Port-forward the GitLab sim (to see review comments locally)
port-forward-gitlab:
    kubectl -n night-city port-forward svc/gitlab-sim 3001:3001

# Tail GitLab sim logs (see incoming review comments)
logs-gitlab:
    kubectl -n night-city logs -f deployment/gitlab-sim

# Tail webhook gateway logs
logs-gateway:
    kubectl -n night-city logs -f deployment/webhook-gateway

# Watch workflow executions
watch-workflows:
    kubectl -n argo get workflows -w

# =============================================================================
# Full Demo
# =============================================================================

# Run the full demo: build, deploy, then simulate a webhook
demo: build deploy
    @echo ""
    @echo "Waiting for services to stabilize..."
    @sleep 10
    @echo ""
    @echo "=== Simulating merge request webhook ==="
    @echo ""
    just simulate
    @echo ""
    @echo "Watch the workflow: just watch-workflows"
    @echo "See the review:    just logs-gitlab"

# =============================================================================
# Cleanup
# =============================================================================

# Clean build artifacts
clean:
    rm -rf dist node_modules

# Full reset (undeploy from k8s + clean)
reset: undeploy clean
    @echo "Full reset complete"
