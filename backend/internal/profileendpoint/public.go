package profileendpoint

import (
	"net"
	"net/url"
	"os"
	"strings"
)

// ValidatePublicURL validates an endpoint used only to generate browser-facing
// presigned URLs. The optional, deployment-controlled exception is restricted to
// one exact loopback URL. Server request URLs and internal endpoints never use
// this exception; their transport-level SSRF checks remain enabled.
func ValidatePublicURL(field string, raw *string, allowRemote bool) error {
	if allowRemote && raw != nil && allowedLoopbackPublicEndpoint(*raw) {
		return ValidateURL(field, raw, false)
	}
	return ValidateURL(field, raw, allowRemote)
}

func allowedLoopbackPublicEndpoint(raw string) bool {
	allowed := strings.TrimSpace(os.Getenv("S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT"))
	value := strings.TrimSpace(raw)
	if allowed == "" || strings.TrimRight(value, "/") != strings.TrimRight(allowed, "/") {
		return false
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return false
	}
	host := normalizeHost(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
