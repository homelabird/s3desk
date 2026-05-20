package redact

import (
	"regexp"
	"strings"
)

const Marker = "[REDACTED]"

const diagnosticSecretFieldPattern = `access[-_]?key[-_]?id|aws[-_]?access[-_]?key[-_]?id|secret[-_]?access[-_]?key|aws[-_]?secret[-_]?access[-_]?key|session[-_]?token|aws[-_]?session[-_]?token|security[-_]?token|account[-_]?key|storage[-_]?account[-_]?key|shared[-_]?key|application[-_]?key|b2[-_]?application[-_]?key|sas[-_]?token|sas[-_]?url|shared[-_]?access[-_]?signature|api[-_]?token|auth[-_]?token|access[-_]?token|refresh[-_]?token|password|passwd|pass[-_]?phrase|passphrase|private[-_]?key|key[-_]?content|key[-_]?file[-_]?pass[-_]?phrase|client[-_]?secret|client[-_]?certificate[-_]?password|credentials|credential|service[-_]?account[-_]?credentials` // #nosec G101 -- this is a redaction field-name pattern, not a credential value.

var (
	diagnosticPrivateKeyRE      = regexp.MustCompile(`(?is)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----`)
	diagnosticEscapedQuotedKVRE = regexp.MustCompile(`(?i)(\\["'](?:` + diagnosticSecretFieldPattern + `)\\["']\s*:\s*\\["'])[^\\\r\n]*?(\\["'])`)
	diagnosticQuotedKVRE        = regexp.MustCompile(`(?i)(["']?(?:` + diagnosticSecretFieldPattern + `)["']?\s*[:=]\s*["'])[^"'\r\n]*(['"])`)
	diagnosticBareKVRE          = regexp.MustCompile(`(?i)(\b(?:` + diagnosticSecretFieldPattern + `)\b\s*[:=]\s*)[^\s,;&\[\]})"']+`)
	diagnosticHeaderRE          = regexp.MustCompile(`(?im)(\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+`)
	diagnosticQueryRE           = regexp.MustCompile(`(?i)([?&;](?:x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|x-goog-credential|x-goog-access-id|signature|sig|awsaccesskeyid|access_key_id|accesskeyid|security-token|security_token|session-token|session_token|api_token|access_token|refresh_token|token|client_secret|sas_token|shared_access_signature)\s*=\s*)[^&\s"'<>]+`)
)

func Diagnostic(s string) string {
	if s == "" {
		return s
	}
	out := diagnosticPrivateKeyRE.ReplaceAllString(s, Marker)
	out = diagnosticEscapedQuotedKVRE.ReplaceAllString(out, "${1}"+Marker+"${2}")
	out = diagnosticHeaderRE.ReplaceAllString(out, "${1}"+Marker)
	out = diagnosticQuotedKVRE.ReplaceAllString(out, "${1}"+Marker+"${2}")
	out = diagnosticBareKVRE.ReplaceAllString(out, "${1}"+Marker)
	out = diagnosticQueryRE.ReplaceAllString(out, "${1}"+Marker)
	return out
}

func DiagnosticDetails(details map[string]any) map[string]any {
	if len(details) == 0 {
		return nil
	}
	out := make(map[string]any, len(details))
	for k, v := range details {
		out[k] = DiagnosticDetailValue(k, v)
	}
	return out
}

func DiagnosticDetailValue(key string, value any) any {
	if SecretField(key) {
		return Marker
	}
	switch v := value.(type) {
	case string:
		return Diagnostic(v)
	case []string:
		out := make([]string, len(v))
		for i, item := range v {
			out[i] = Diagnostic(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = DiagnosticDetailValue("", item)
		}
		return out
	case map[string]string:
		out := make(map[string]string, len(v))
		for k, item := range v {
			if SecretField(k) {
				out[k] = Marker
				continue
			}
			out[k] = Diagnostic(item)
		}
		return out
	case map[string]any:
		return DiagnosticDetails(v)
	default:
		return value
	}
}

func SecretField(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	key = strings.NewReplacer("-", "", "_", "").Replace(key)
	switch key {
	case "accesskeyid", "awsaccesskeyid", "secretaccesskey", "awssecretaccesskey",
		"sessiontoken", "awssessiontoken", "securitytoken", "accountkey",
		"storageaccountkey", "sharedkey", "applicationkey", "b2applicationkey",
		"sastoken", "sasurl", "sharedaccesssignature", "apitoken", "authtoken",
		"accesstoken", "refreshtoken", "password", "passwd", "passphrase",
		"privatekey", "keycontent", "keyfilepassphrase", "clientsecret",
		"clientcertificatepassword", "credentials", "credential", "serviceaccountcredentials":
		return true
	default:
		return false
	}
}
