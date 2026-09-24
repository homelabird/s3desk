#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_PATH="${INLINE_STYLE_TARGET_PATH:-frontend/src}"
FETCH_DEPTH="${INLINE_STYLE_FETCH_DEPTH:-200}"

is_zero_sha() {
  local sha="$1"
  [[ -z "$sha" || "$sha" =~ ^0+$ ]]
}

pick_base_ref() {
  local base=""
  if [[ -n "${INLINE_STYLE_BASE_SHA:-}" ]]; then
    base="${INLINE_STYLE_BASE_SHA}"
  elif [[ -n "${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}" ]] && ! is_zero_sha "${CI_MERGE_REQUEST_DIFF_BASE_SHA}"; then
    base="${CI_MERGE_REQUEST_DIFF_BASE_SHA}"
  elif [[ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA:-}" ]] && ! is_zero_sha "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA}"; then
    base="${CI_MERGE_REQUEST_TARGET_BRANCH_SHA}"
  elif [[ -n "${CI_COMMIT_BEFORE_SHA:-}" ]] && ! is_zero_sha "${CI_COMMIT_BEFORE_SHA}"; then
    base="${CI_COMMIT_BEFORE_SHA}"
  elif git -C "${ROOT}" rev-parse --verify --quiet HEAD~1 >/dev/null; then
    base="HEAD~1"
  fi
  printf '%s' "$base"
}

try_fetch_base_candidates() {
  local fetched=1
  if [[ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-}" ]]; then
    git -C "${ROOT}" fetch --no-tags --depth "${FETCH_DEPTH}" origin \
      "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME}" \
      >/dev/null 2>&1 || true
  fi
  if [[ -n "${CI_DEFAULT_BRANCH:-}" ]]; then
    git -C "${ROOT}" fetch --no-tags --depth "${FETCH_DEPTH}" origin \
      "${CI_DEFAULT_BRANCH}" \
      >/dev/null 2>&1 || true
  fi
  if [[ -n "${CI_COMMIT_REF_NAME:-}" ]]; then
    git -C "${ROOT}" fetch --no-tags --deepen "${FETCH_DEPTH}" origin \
      "${CI_COMMIT_REF_NAME}" \
      >/dev/null 2>&1 || true
  fi
  if git -C "${ROOT}" rev-parse --verify --quiet HEAD~1 >/dev/null; then
    fetched=0
  fi
  return "${fetched}"
}

resolve_base_ref() {
  local base="$1"
  local strict_override=0
  if [[ -n "${INLINE_STYLE_BASE_SHA:-}" ]]; then
    strict_override=1
  fi

  if [[ -n "${base}" ]] && git -C "${ROOT}" rev-parse --verify --quiet "${base}" >/dev/null; then
    printf '%s' "${base}"
    return 0
  fi

  try_fetch_base_candidates || true

  if [[ -n "${base}" ]] && git -C "${ROOT}" rev-parse --verify --quiet "${base}" >/dev/null; then
    printf '%s' "${base}"
    return 0
  fi
  if [[ "${strict_override}" -eq 1 ]]; then
    return 1
  fi
  if [[ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-}" ]] && git -C "${ROOT}" rev-parse --verify --quiet "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME}" >/dev/null; then
    printf '%s' "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME}"
    return 0
  fi
  if [[ -n "${CI_DEFAULT_BRANCH:-}" ]] && git -C "${ROOT}" rev-parse --verify --quiet "${CI_DEFAULT_BRANCH}" >/dev/null; then
    printf '%s' "${CI_DEFAULT_BRANCH}"
    return 0
  fi
  if git -C "${ROOT}" rev-parse --verify --quiet HEAD~1 >/dev/null; then
    printf '%s' "HEAD~1"
    return 0
  fi
  return 1
}

BASE_CANDIDATE="$(pick_base_ref)"
if ! BASE_REF="$(resolve_base_ref "${BASE_CANDIDATE}")"; then
  echo "[inline-style-guard] failed to resolve base ref (candidate='${BASE_CANDIDATE}')." >&2
  echo "[inline-style-guard] set INLINE_STYLE_BASE_SHA or ensure git history/target branch is fetchable." >&2
  exit 2
fi

echo "[inline-style-guard] checking net-new inline styles from ${BASE_REF}..HEAD in ${TARGET_PATH}"
DIFF_OUTPUT="$(git -C "${ROOT}" diff --unified=0 --no-color "${BASE_REF}"...HEAD -- "${TARGET_PATH}")"
MATCHES="$(
  printf '%s\n' "${DIFF_OUTPUT}" \
    | grep -E '^\+[^+].*style[[:space:]]*=[[:space:]]*\{\{' || true
)"

if [[ -n "${MATCHES}" ]]; then
  echo "[inline-style-guard] net-new inline style detected. Use CSS modules or design tokens instead." >&2
  printf '%s\n' "${MATCHES}" >&2
  exit 1
fi

echo "[inline-style-guard] ok"
