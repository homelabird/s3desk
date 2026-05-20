package profileendpoint

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"
)

var blockedHosts = map[string]struct{}{
	"instance-data.ec2.internal": {},
	"metadata.google.internal":   {},
}

const resolveTimeout = 2 * time.Second

var (
	lookupHooksMu sync.RWMutex
	lookupCNAME   = func(ctx context.Context, host string) (string, error) {
		return net.DefaultResolver.LookupCNAME(ctx, host)
	}
	lookupIPAddr = func(ctx context.Context, host string) ([]net.IPAddr, error) {
		return net.DefaultResolver.LookupIPAddr(ctx, host)
	}
)

var blockedIPs = []net.IP{
	net.ParseIP("100.100.100.200"),
	net.ParseIP("169.254.169.254"),
	net.ParseIP("169.254.170.2"),
}

func SetLookupHooksForTest(
	testLookupCNAME func(context.Context, string) (string, error),
	testLookupIPAddr func(context.Context, string) ([]net.IPAddr, error),
) func() {
	lookupHooksMu.Lock()
	originalCNAME := lookupCNAME
	originalIPAddr := lookupIPAddr
	if testLookupCNAME != nil {
		lookupCNAME = testLookupCNAME
	}
	if testLookupIPAddr != nil {
		lookupIPAddr = testLookupIPAddr
	}
	lookupHooksMu.Unlock()
	return func() {
		lookupHooksMu.Lock()
		lookupCNAME = originalCNAME
		lookupIPAddr = originalIPAddr
		lookupHooksMu.Unlock()
	}
}

func ValidateTLSSkipVerifyEndpoint(field string, raw *string, allowRemote bool) error {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return fmt.Errorf("tlsInsecureSkipVerify requires %s to be set to a custom https:// endpoint", field)
	}
	if err := ValidateURL(field, raw, allowRemote); err != nil {
		return err
	}

	value := strings.TrimSpace(*raw)
	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() || parsed.Host == "" {
		return fmt.Errorf("tlsInsecureSkipVerify requires %s to be an absolute https:// URL", field)
	}
	if strings.ToLower(parsed.Scheme) != "https" {
		return fmt.Errorf("tlsInsecureSkipVerify requires %s to use https://", field)
	}

	host := normalizeHost(parsed.Hostname())
	if host == "" {
		return fmt.Errorf("tlsInsecureSkipVerify requires %s to be an absolute https:// URL", field)
	}
	if ip := net.ParseIP(host); ip != nil {
		if !isTLSSkipVerifyPrivateIP(ip) {
			return fmt.Errorf("tlsInsecureSkipVerify is allowed only for private, loopback, or link-local https endpoints")
		}
		return nil
	}

	addrs, err := lookupEndpointIPAddr(host)
	if err != nil || len(addrs) == 0 {
		return fmt.Errorf("%s host could not be resolved", field)
	}
	for _, addr := range addrs {
		if !isTLSSkipVerifyPrivateIP(addr.IP) {
			return fmt.Errorf("tlsInsecureSkipVerify is allowed only for private, loopback, or link-local https endpoints")
		}
	}
	return nil
}

func ValidateURL(field string, raw *string, allowRemote bool) error {
	if raw == nil {
		return nil
	}
	value := strings.TrimSpace(*raw)
	if value == "" {
		return nil
	}

	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() || parsed.Host == "" {
		return fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	return validateParsedURL(field, parsed, allowRemote, false)
}

func ValidateRequestURL(field string, parsed *url.URL, allowRemote bool) error {
	if parsed == nil {
		return fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	if !parsed.IsAbs() || parsed.Host == "" {
		return fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	return validateParsedURL(field, parsed, allowRemote, true)
}

func validateParsedURL(field string, parsed *url.URL, allowRemote bool, allowQuery bool) error {
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	if parsed.User != nil {
		return fmt.Errorf("%s must not include credentials", field)
	}
	if !allowQuery && parsed.RawQuery != "" {
		return fmt.Errorf("%s must not include a query string", field)
	}
	if parsed.Fragment != "" {
		return fmt.Errorf("%s must not include a fragment", field)
	}

	host := normalizeHost(parsed.Hostname())
	if host == "" {
		return fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	if _, blocked := blockedHosts[host]; blocked {
		return fmt.Errorf("%s points to a blocked metadata host", field)
	}
	if allowRemote && (host == "localhost" || strings.HasSuffix(host, ".localhost")) {
		return fmt.Errorf("%s must not target localhost when remote access is enabled", field)
	}

	if ip := net.ParseIP(host); ip != nil {
		return validateEndpointIP(field, ip, allowRemote)
	}
	if err := validateResolvedEndpointHost(field, host, allowRemote); err != nil {
		return err
	}
	return nil
}

func validateResolvedEndpointHost(field, host string, allowRemote bool) error {
	if canonical, err := lookupEndpointCNAME(host); err == nil {
		canonical = normalizeHost(canonical)
		if _, blocked := blockedHosts[canonical]; blocked {
			return fmt.Errorf("%s points to a blocked metadata host", field)
		}
		if allowRemote && (canonical == "localhost" || strings.HasSuffix(canonical, ".localhost")) {
			return fmt.Errorf("%s must not target localhost when remote access is enabled", field)
		}
	}

	addrs, err := lookupEndpointIPAddr(host)
	if err != nil {
		return fmt.Errorf("%s host could not be resolved", field)
	}
	if len(addrs) == 0 {
		return fmt.Errorf("%s host could not be resolved", field)
	}
	for _, addr := range addrs {
		if err := validateEndpointIP(field, addr.IP, allowRemote); err != nil {
			return err
		}
	}
	return nil
}

func validateEndpointIP(field string, ip net.IP, allowRemote bool) error {
	if isBlockedIP(ip) {
		return fmt.Errorf("%s points to a blocked metadata host", field)
	}
	if ip.IsUnspecified() || ip.IsMulticast() || ip.IsLinkLocalMulticast() {
		return fmt.Errorf("%s must not target a non-routable address", field)
	}
	if allowRemote && (ip.IsLoopback() || ip.IsLinkLocalUnicast()) {
		return fmt.Errorf("%s must not target loopback or link-local addresses when remote access is enabled", field)
	}
	return nil
}

func isBlockedIP(ip net.IP) bool {
	for _, blocked := range blockedIPs {
		if blocked != nil && blocked.Equal(ip) {
			return true
		}
	}
	return false
}

func isTLSSkipVerifyPrivateIP(ip net.IP) bool {
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()
}

func lookupEndpointCNAME(host string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), resolveTimeout)
	defer cancel()
	lookupHooksMu.RLock()
	lookup := lookupCNAME
	lookupHooksMu.RUnlock()
	return lookup(ctx, host)
}

func lookupEndpointIPAddr(host string) ([]net.IPAddr, error) {
	ctx, cancel := context.WithTimeout(context.Background(), resolveTimeout)
	defer cancel()
	lookupHooksMu.RLock()
	lookup := lookupIPAddr
	lookupHooksMu.RUnlock()
	return lookup(ctx, host)
}

func normalizeHost(host string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
}
