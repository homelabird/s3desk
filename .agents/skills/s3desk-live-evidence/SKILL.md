---
name: s3desk-live-evidence
description: Plan, run, audit, or record S3Desk real-provider, reverse-proxy, portable-backup, deployment, Helm, and release evidence. Use when local tests cannot prove the requested environment; do not use to label mock or emulator results as live proof.
---

# S3Desk Live Evidence

Read only the reference matching the requested environment:

- `docs/release/evidence/README.md` for evidence discovery, formats, and secret rejection rules.
- `docs/BUCKET_GOVERNANCE.md` for provider capability validation.
- `docs/PORTABLE_BACKUP.md` for backup/import behavior and limits.
- `docs/RUNBOOK.md` for runtime, proxy, and deployment operations.
- `docs/RELEASE_GATE.md` when evidence is for a release candidate.

## Derive Scope

Let the checked-in audit derive requirements from the actual changed files:

```bash
python3 scripts/check_release_evidence.py --format checklist
```

For a committed candidate, use the same explicit comparison everywhere:

```bash
python3 scripts/check_release_evidence.py --base <base> --head <candidate> --format checklist
```

Do not broaden evidence requirements from memory or narrow them to whichever credentials are available.

## Run Safely

- Preflight with `python3 scripts/check_live_evidence_env.py --scope <scope>`; it reports set/missing state without printing values.
- Never print or commit tokens, credentials, private keys, signed URL queries, cookies, or backup passwords.
- Use disposable targets where the maintained workflow requires mutation.
- Inspecting or preflighting an environment does not authorize deployment or provider mutation. Perform external writes only when the user requested that operation.
- Store intentional sanitized records under `docs/release/evidence/` using the maintained template and the exact candidate tag or commit.

## Evidence Labels

- Source, unit, mock, emulator, local browser, Helm lint, and Helm render are local evidence.
- A missing credential or environment is an unexecuted gate, not a failure and not a pass.
- Provider proof requires the named real provider and provider-native confirmation.
- Reverse-proxy proof requires the deployed external URL and all required route results.
- Backup-portable proof requires the maintained smoke set and sanitized source/target metadata.
- Release proof requires candidate-matched evidence and the full release gates.

For final candidate validation, run the strict commands emitted by the audit. Do not hand-maintain a parallel checklist in this skill.
