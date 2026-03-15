---
title: Building server-go for OpenSandbox
date: 2026-03-15
summary: How we built a Go lifecycle server with runtime parity, pool support, and Kubernetes-first testing.
---

# Building `server-go`: a Go Lifecycle Server for OpenSandbox

We recently built a new Go implementation of the OpenSandbox lifecycle server: `server-go`.

This post captures why we did it, how we structured it, what parity gaps we closed, and what we learned while validating it in real Kubernetes + pool workflows.

## Why a Go server?

The existing Python server worked well, but we wanted a Go implementation for:

- tighter integration with Kubernetes-heavy deployments
- predictable operational profile in long-running control-plane services
- easier distribution in Go-native infra environments
- strong typing and compile-time safety for runtime/controller boundaries

The goal was not “different APIs.” The goal was **1:1 lifecycle API behavior** with incremental parity.

## Architecture we implemented

`server-go` follows a clear layering:

- `controller`: Gin HTTP handlers and routing
- `service`: lifecycle orchestration and policy decisions
- `repository`: GORM persistence (Postgres)
- `runtime`: pluggable backends (`docker`, `kubernetes`)

Key stack:

- Gin for REST API
- GORM for persistence
- Postgres for state
- Kubernetes CRD runtime for cluster-backed sandboxes

This kept transport, business logic, persistence, and runtime concerns separated from day one.

## Runtime model

Two runtime paths are supported:

1. Docker runtime (local and simple deployments)
2. Kubernetes runtime (CRD-backed, controller-driven)

For Kubernetes, `BatchSandbox` is the runtime object of record. The Go server creates/updates these CRDs and resolves status/endpoints via runtime inspection.

## Major parity milestones we shipped

We tracked parity as a sequence of focused gaps:

1. Initial Go server lifecycle API
2. Expiration (`spec.expireTime` + renew path)
3. CRD↔DB reconciliation and runtime backfill
4. Ingress endpoint mode formatting (`wildcard` / `uri` / `header`)
5. Network policy sidecar wiring (`EGRESS_IMAGE`)
6. Secure runtime mapping (Docker runtime + K8s RuntimeClass)
7. `poolRef` support for pooled creation
8. Pool status mapping fix (pending vs terminated)
9. External E2E coverage for pool and network policy

## E2E testing strategy

We added API-facing external E2E tests in `cmd/server` to validate real behavior against a running server endpoint:

- health / create / list / get / endpoint / delete baseline
- pool allocation and release lifecycle (with polling for delays)
- network policy sidecar + env payload wiring

This gave us confidence beyond unit tests because it exercises DB + API + runtime + controller timing.

## Current state

`server-go` now has strong parity for core lifecycle behavior, pool mode, and network policy wiring.

Remaining intentional gap: Kubernetes pause/resume semantics (Python runtime also reports this as not supported).

## What comes next

The next architectural step is storage-first session continuity via **Workspaces**:

- managed PVC lifecycle
- sandbox↔workspace attachment model
- retention and GC policy
- support for sequential handoff and optional RWX shared workflows


## What We Did Differently

Compared to the existing behavior, we made one intentional server-side choice and one practical SDK-side adjustment:

1. **Async sandbox creation in `server-go`**
   - The create API returns after workload submission, without waiting for endpoint allocation to be ready.
   - Endpoint availability is treated as eventual consistency and handled by follow-up endpoint/status calls and retries.

2. **Small Python SDK usability fix for readiness timing**
   - We added a lightweight wait-for-running helper in examples so SDK flows avoid racing endpoint resolution too early.
   - This keeps client behavior stable without changing core SDK contracts.

These were the main practical differences during rollout; most other work focused on runtime parity and controller-aligned behavior.

## Closing thought

The biggest lesson from this migration: parity is less about endpoint shape and more about control-plane behavior under real timing, reconciliation, and lifecycle edges. Getting those edges right turned `server-go` from “API compatible” into “operationally trustworthy.”
