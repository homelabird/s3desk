#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${OCI_SOURCE_DIR:-$HOME/.oci}"
SRC_CONFIG="${OCI_SOURCE_CONFIG:-$SRC_DIR/config}"
DEST_DIR="${OCI_RUNTIME_DIR:-$(pwd)/data/oci-runtime}"
DEST_CONFIG="$DEST_DIR/config"
DEST_KEY="$DEST_DIR/oci_api_key.pem"
DEST_PUBKEY="$DEST_DIR/oci_api_key_public.pem"
CONTAINER_KEY_PATH="${OCI_CONTAINER_KEY_PATH:-/data/oci/oci_api_key.pem}"

if [[ ! -f "$SRC_CONFIG" ]]; then
	echo "missing OCI config: $SRC_CONFIG" >&2
	exit 1
fi

KEY_FILE="$(awk -F= '/^[[:space:]]*key_file[[:space:]]*=/{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit}' "$SRC_CONFIG")"
if [[ -z "${KEY_FILE:-}" || ! -f "$KEY_FILE" ]]; then
	echo "missing OCI key_file referenced by config: ${KEY_FILE:-<empty>}" >&2
	exit 1
fi

PUBKEY_FILE="${KEY_FILE%.*}_public.pem"

mkdir -p "$DEST_DIR"
cp "$KEY_FILE" "$DEST_KEY"
chmod 0644 "$DEST_KEY"

if [[ -f "$PUBKEY_FILE" ]]; then
	cp "$PUBKEY_FILE" "$DEST_PUBKEY"
	chmod 0644 "$DEST_PUBKEY"
fi

awk -v dest_key="$CONTAINER_KEY_PATH" '
	BEGIN { in_default = 0 }
	/^\[/ {
		in_default = ($0 == "[DEFAULT]")
		print
		next
	}
	in_default && $0 ~ /^[[:space:]]*key_file[[:space:]]*=/ {
		print "key_file=" dest_key
		next
	}
	{ print }
' "$SRC_CONFIG" >"$DEST_CONFIG"
chmod 0644 "$DEST_CONFIG"

echo "synced OCI runtime config to $DEST_DIR"
