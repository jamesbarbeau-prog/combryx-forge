# Conciliation Manager — system flow and functionality

A blank, multi-tenant module: a new company signs up, creates a workspace, and starts with no data. Everything below is behaviour of the product, not imported content.

## 1. Case lifecycle

```mermaid
flowchart TD
  A[Conciliation notice arrives<br/>Tarion API sync or manual entry] --> B{Common elements<br/>and excluded?}
  B -- yes --> X[Skipped, logged]
  B -- no --> C{Known case number?}
  C -- no, letter complete --> D[Case created automatically<br/>items + inspection date]
  C -- no, letter incomplete --> R[Review queue]
  C -- yes --> E{Same letter version?}
  E -- yes --> Z[Nothing to do]
  E -- no --> F{New items or date?}
  F -- date changed before inspection --> G[Inspection rescheduled automatically]
  F -- items differ, or date changed after CAR --> R
  F -- nothing new --> Z
  R --> H[Manager applies or dismisses]
  D --> S[Cycle 1: Scheduled]
  G --> S
  H --> S
```

## 2. Inspection cycle stages (computed, never typed)

```mermaid
stateDiagram-v2
  [*] --> Scheduled
  Scheduled --> AwaitingCAR: inspection date reached
  AwaitingCAR --> CARReceived: CAR outcomes applied
  CARReceived --> Closed: 30-day clock ends or case closed
  CARReceived --> Superseded: newer cycle booked
  AwaitingCAR --> CARReceived: reset and re-apply allowed
```

Per item, after the CAR: Warranted / Partially Warranted / Not Warranted / Withdrawn. Warranted items go either to **repair** (120-day clock, re-inspection if disputed) or to **cash settlement**.

## 3. Cash settlement

```mermaid
flowchart LR
  W[Warranted items] --> P[Partial offer<br/>base x 1.30 x 1.15 x 1.13]
  W --> F[Full & Final release<br/>all outstanding priced items]
  P --> PS{Signed release ref?}
  PS -- accepted --> L[Items Settled and locked]
  PS -- declined --> O[Items reopened]
  F --> FS{Decision}
  FS -- accepted + signed ref --> C[All settled, case closed, cycles closed]
  FS -- declined --> O
  L --> F2[Remaining items continue<br/>repair or Full & Final]
```

Rules enforced in the database: settled items are frozen; pending-signature items cannot be re-priced; only one open Full & Final offer per case; cash status cannot be edited directly, only through the offer / accept / decline actions; audit and activity logs are append-only.

## 4. Who can do what

| Role | Read | Change |
|---|---|---|
| manager | all cases | everything, add team, re-open cases |
| coordinator | all cases | nothing yet (read-only) |
| viewer | all cases | nothing |

Every row belongs to one company; one company can never read another's data.

## 5. Functionality map

- Dashboard: open inspections, scheduled / awaiting CAR / CAR received, overdue and due-in-7-days, pending cash, RB04 count, needs-attention list, freehold / common-elements toggle.
- Case folder: overview, items (inline edit, multi-select actions), inspection cycles, cash, activity log.
- Tarion intake: automatic sync, review queue, version-aware (the same letter is never reprocessed).
- Team: add teammates by email with a role.
- Not built yet: CAR PDF reading, release document generation, supervisor reminder emails, calendar sync, per-company Tarion credentials.
