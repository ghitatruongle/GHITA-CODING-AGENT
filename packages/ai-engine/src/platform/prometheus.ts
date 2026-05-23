// ==============================================================================
// GHITA CODING AGENT - Docker, K8s, Prometheus & Terraform Configurations
// ==============================================================================

export const DOCKERFILE_TEMPLATE = `
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/ai-engine/package.json ./packages/ai-engine/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @ghita/shared build && pnpm --filter @ghita/ai-engine build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/ai-engine/dist ./packages/ai-engine/dist
COPY --from=builder /app/packages/ai-engine/package.json ./packages/ai-engine/package.json
EXPOSE 3001
ENV PORT=3001
CMD ["node", "packages/ai-engine/dist/platform/gateway.js"]
`;

export const DOCKER_COMPOSE_TEMPLATE = `
version: '3.8'
services:
  ai-gateway:
    build:
      context: .
      dockerfile: Dockerfile.gateway
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
    restart: always
`;

export const K8S_DEPLOYMENT_TEMPLATE = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ghita-ai-gateway
  labels:
    app: ghita-ai-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ghita-ai-gateway
  template:
    metadata:
      labels:
        app: ghita-ai-gateway
    spec:
      containers:
      - name: gateway
        image: ghita-truongle/ai-gateway:latest
        ports:
        - containerPort: 3001
        env:
        - name: PORT
          value: "3001"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secrets
              key: api-key
---
apiVersion: v1
kind: Service
metadata:
  name: ghita-ai-gateway-service
spec:
  selector:
    app: ghita-ai-gateway
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3001
  type: LoadBalancer
`;

export const TERRAFORM_TEMPLATE = `
variable "gcp_project_id" {
  type        = string
  description = "The GCP project ID to deploy to"
}

variable "region" {
  type    = string
  default = "us-central1"
}

resource "google_cloud_run_v2_service" "ai_gateway" {
  name     = "ghita-ai-gateway"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "gcr.io/\${var.gcp_project_id}/ai-gateway:latest"
      ports {
        container_port = 3001
      }
      env {
        name  = "PORT"
        value = "3001"
      }
      env {
        name  = "OPENAI_API_KEY"
        value = "your-api-key-here"
      }
    }
  }
}
`;

export class DeployConfigGenerator {
  generateDockerfile(): string {
    return DOCKERFILE_TEMPLATE.trim();
  }

  generateDockerCompose(): string {
    return DOCKER_COMPOSE_TEMPLATE.trim();
  }

  generateK8s(): string {
    return K8S_DEPLOYMENT_TEMPLATE.trim();
  }

  generateTerraform(): string {
    return TERRAFORM_TEMPLATE.trim();
  }
}
