#!/usr/bin/env bash
set -euo pipefail

CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
DIM='\033[2m'
BRIGHT='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}$(printf '=%.0s' {1..50})${RESET}"
echo -e "${BRIGHT}${CYAN}  NIGHT CITY AGENTS // ARGO SETUP${RESET}"
echo -e "${CYAN}$(printf '=%.0s' {1..50})${RESET}"
echo ""

# Check prerequisites
echo -e "${DIM}Checking prerequisites...${RESET}"

if ! command -v kubectl &> /dev/null; then
  echo -e "${YELLOW}kubectl not found. Install it first.${RESET}"
  exit 1
fi

if ! kubectl cluster-info &> /dev/null 2>&1; then
  echo -e "${YELLOW}Cannot reach Kubernetes cluster. Enable Kubernetes in Docker Desktop.${RESET}"
  exit 1
fi

echo -e "${GREEN}  Kubernetes cluster reachable${RESET}"

# Create namespaces
echo ""
echo -e "${DIM}Creating namespaces...${RESET}"
kubectl create namespace argo --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace argo-events --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace night-city --dry-run=client -o yaml | kubectl apply -f -
echo -e "${GREEN}  Namespaces ready${RESET}"

# Install Argo Workflows
echo ""
echo -e "${DIM}Installing Argo Workflows...${RESET}"
kubectl apply -n argo -f https://github.com/argoproj/argo-workflows/releases/latest/download/quick-start-minimal.yaml
echo -e "${GREEN}  Argo Workflows installed${RESET}"

# Install Argo Events
echo ""
echo -e "${DIM}Installing Argo Events...${RESET}"
kubectl apply -f https://raw.githubusercontent.com/argoproj/argo-events/stable/manifests/install.yaml
kubectl apply -f https://raw.githubusercontent.com/argoproj/argo-events/stable/manifests/install-validating-webhook.yaml
echo -e "${GREEN}  Argo Events installed${RESET}"

# Create EventBus (required by Argo Events)
echo ""
echo -e "${DIM}Creating EventBus...${RESET}"
kubectl apply -n argo-events -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: EventBus
metadata:
  name: default
spec:
  jetstream:
    version: latest
EOF
echo -e "${GREEN}  EventBus created${RESET}"

# Wait for Argo to be ready
echo ""
echo -e "${DIM}Waiting for Argo pods to be ready (this may take a minute)...${RESET}"
kubectl wait --for=condition=ready pod -l app=argo-server -n argo --timeout=120s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l app=eventbus-controller -n argo-events --timeout=120s 2>/dev/null || true

echo ""
echo -e "${CYAN}$(printf '=%.0s' {1..50})${RESET}"
echo -e "${GREEN}  ARGO SETUP COMPLETE${RESET}"
echo -e "${CYAN}$(printf '=%.0s' {1..50})${RESET}"
echo ""
echo -e "  Argo UI:    ${BRIGHT}kubectl -n argo port-forward svc/argo-server 2746:2746${RESET}"
echo -e "              then open ${BRIGHT}https://localhost:2746${RESET}"
echo ""
echo -e "  Next steps:"
echo -e "    1. ${DIM}just build${RESET}              # Build the Docker image"
echo -e "    2. ${DIM}just create-secret${RESET}      # Set your ANTHROPIC_API_KEY"
echo -e "    3. ${DIM}just deploy${RESET}             # Deploy all services + Argo config"
echo -e "    4. ${DIM}just simulate${RESET}           # Fire a test webhook"
echo ""
