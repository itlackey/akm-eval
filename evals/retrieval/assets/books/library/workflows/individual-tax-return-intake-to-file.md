---
type: workflow
description: Intake a client's documents, compute their tax position, and prepare an individual federal income tax return for review and filing
tags:
  - example
  - tax
  - individual-filing
params:
  client_ref: { type: string, description: Client identifier or engagement reference. }
  tax_year: { type: string, description: "The tax year being filed, e.g. 2025." }
  workspace_dir: { type: string, description: Directory for run artefacts. Defaults to `.akm-run/<runId>`. }
steps:
  - id: collect-documents
  - id: determine-status-and-deduction
  - id: compute-return
  - id: review-and-file
---

# Individual Tax Return Intake to File

A repeatable structure for taking an individual client from document
intake through a return ready for review and filing.

## collect-documents

Collect source documents.

1. Request income documents (W-2s, 1099s, K-1s), records of deductible
   expenses, and the prior year's return for the client named by `client_ref`.
2. Log every document received in `workspace_dir/intake-log.md` with
   the date received and a one-line description.
3. Flag any expected document that is missing (e.g. a K-1 the client
   mentioned but did not send) rather than proceeding without it.

### gate

- `intake-log.md` lists every document received for the `tax_year`.
- Missing expected documents are explicitly flagged, not silently skipped.

## determine-status-and-deduction

Determine filing status and deduction approach.

1. Confirm filing status (single, married filing jointly, married filing
   separately, head of household) directly with the client if ambiguous.
2. Compare the standard deduction for that status against the client's
   itemizable expenses to decide which approach to use; cite the specific
   revenue procedure and tax year for the standard deduction figure used.
3. Record the decision and the reasoning in `workspace_dir/deduction-decision.md`.

### gate

- Filing status is confirmed, not assumed.
- The standard-vs-itemized decision is recorded with its reasoning and a
  cited source for any dollar figure used.

## compute-return

Compute the return.

1. Reconcile any estimated tax payments already made during the `tax_year`.
2. Apply eligible credits (child tax credit, education credits, earned
   income credit) based on the documents collected.
3. Compute the final balance due or refund and record it in
   `workspace_dir/computation-summary.md`.

### gate

- `computation-summary.md` shows the final balance due or refund with the
  inputs that produced it.

## review-and-file

Review and file.

1. Have a second preparer review `computation-summary.md` against the
   source documents in `intake-log.md`.
2. Confirm the filing deadline for the `tax_year`; if more time is needed,
   file an extension, and remind the client that an extension does not
   extend the payment deadline.
3. Once reviewed, file the return and store the acceptance confirmation in
   `workspace_dir/filing-confirmation.md`.

### gate

- A second preparer's review is recorded before filing.
- The extension-vs-payment-deadline distinction is explicitly communicated
  to the client if an extension is used.
- `filing-confirmation.md` contains the acceptance confirmation.
