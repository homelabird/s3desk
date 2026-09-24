---
name: s3desk-live-evidence
description: Plan, run, audit, or record S3Desk real-provider, reverse-proxy, portable-backup, or deployment evidence. Use only when local checks cannot prove the requested environment; never label mocks or emulators as live proof.
---

# S3Desk Live Evidence

Let the maintained audit derive evidence from the actual candidate diff:

```bash
python3 scripts/check_release_evidence.py --format checklist
python3 scripts/check_release_evidence.py --base <base> --head <candidate> --format checklist
```

Use the second form for a committed candidate and keep the same refs through evidence and readiness checks. Do not widen or narrow the audit's scope from memory or credential availability.

Before a live run, preflight without exposing values:

```bash
python3 scripts/check_live_evidence_env.py --scope <scope>
```

Read only the matching maintained guide: `docs/BUCKET_GOVERNANCE.md` (provider), `docs/PORTABLE_BACKUP.md` (backup), `docs/RUNBOOK.md` (runtime/proxy/deploy), `docs/RELEASE_GATE.md` (candidate), and `docs/release/evidence/README.md` (formats and secret rules).

Never print or record credentials, tokens, private keys, signed URL queries, cookies, or backup passwords. Use disposable mutation targets where the workflow requires them. Preflight is not authorization to mutate an external system; only perform external writes when requested. Store sanitized records under `docs/release/evidence/` using the maintained template and candidate identity.

Label evidence by what ran: source/unit/mock/emulator/local browser/Helm render are local; provider proof needs the named real provider and its confirmation; proxy proof needs the deployed external URL and required routes; backup proof needs the maintained smoke set and sanitized source/target metadata. Missing credentials or environment mean unexecuted. For candidate validation, follow the strict commands emitted by the audit instead of maintaining a second checklist here.
