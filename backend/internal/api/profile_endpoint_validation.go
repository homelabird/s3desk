package api

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

var blockedProfileEndpointHosts = map[string]struct{}{
	"instance-data.ec2.internal": {},
	"metadata.google.internal":   {},
}

const profileEndpointResolveTimeout = 2 * time.Second

var (
	profileEndpointLookupCNAME = func(ctx context.Context, host string) (string, error) {
		return net.DefaultResolver.LookupCNAME(ctx, host)
	}
	profileEndpointLookupIPAddr = func(ctx context.Context, host string) ([]net.IPAddr, error) {
		return net.DefaultResolver.LookupIPAddr(ctx, host)
	}
)

var blockedProfileEndpointIPs = []net.IP{
	net.ParseIP("100.100.100.200"),
	net.ParseIP("169.254.169.254"),
	net.ParseIP("169.254.170.2"),
}

func validateProfileEndpointURL(field string, raw *string, allowRemote bool) error {
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
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	if parsed.User != nil {
		return fmt.Errorf("%s must not include credentials", field)
	}
	if parsed.RawQuery != "" {
		return fmt.Errorf("%s must not include a query string", field)
	}
	if parsed.Fragment != "" {
		return fmt.Errorf("%s must not include a fragment", field)
	}

	host := normalizeHost(parsed.Hostname())
	if host == "" {
		return fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	if _, blocked := blockedProfileEndpointHosts[host]; blocked {
		return fmt.Errorf("%s points to a blocked metadata host", field)
	}
	if allowRemote && (host == "localhost" || strings.HasSuffix(host, ".localhost")) {
		return fmt.Errorf("%s must not target localhost when remote access is enabled", field)
	}

	if ip := net.ParseIP(host); ip != nil {
		return validateProfileEndpointIP(field, ip, allowRemote)
	}
	if err := validateResolvedProfileEndpointHost(field, host, allowRemote); err != nil {
		return err
	}
	return nil
}

func validateResolvedProfileEndpointHost(field, host string, allowRemote bool) error {
	if canonical, err := lookupProfileEndpointCNAME(host); err == nil {
		canonical = normalizeHost(canonical)
		if _, blocked := blockedProfileEndpointHosts[canonical]; blocked {
			return fmt.Errorf("%s points to a blocked metadata host", field)
		}
		if allowRemote && (canonical == "localhost" || strings.HasSuffix(canonical, ".localhost")) {
			return fmt.Errorf("%s must not target localhost when remote access is enabled", field)
		}
	}

	addrs, err := lookupProfileEndpointIPAddr(host)
	if err != nil {
		return fmt.Errorf("%s host could not be resolved", field)
	}
	if len(addrs) == 0 {
		return fmt.Errorf("%s host could not be resolved", field)
	}
	for _, addr := range addrs {
		if err := validateProfileEndpointIP(field, addr.IP, allowRemote); err != nil {
			return err
		}
	}
	return nil
}

func validateProfileEndpointIP(field string, ip net.IP, allowRemote bool) error {
	if isBlockedProfileEndpointIP(ip) {
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

func isBlockedProfileEndpointIP(ip net.IP) bool {
	for _, blocked := range blockedProfileEndpointIPs {
		if blocked != nil && blocked.Equal(ip) {
			return true
		}
	}
	return false
}

func lookupProfileEndpointCNAME(host string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), profileEndpointResolveTimeout)
	defer cancel()
	return profileEndpointLookupCNAME(ctx, host)
}

func lookupProfileEndpointIPAddr(host string) ([]net.IPAddr, error) {
	ctx, cancel := context.WithTimeout(context.Background(), profileEndpointResolveTimeout)
	defer cancel()
	return profileEndpointLookupIPAddr(ctx, host)
}
