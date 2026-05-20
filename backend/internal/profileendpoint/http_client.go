package profileendpoint

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

type HTTPClientOptions struct {
	AllowRemote bool
	TLSConfig   *tls.Config
	Timeout     time.Duration
}

func NewHTTPClient(opts HTTPClientOptions) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = GuardedDialContext(opts.AllowRemote)
	if opts.TLSConfig != nil {
		transport.TLSClientConfig = opts.TLSConfig
	}
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &http.Client{
		Transport: guardedRoundTripper{
			base:        transport,
			allowRemote: opts.AllowRemote,
		},
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, _ []*http.Request) error {
			return ValidateRequestURL("redirect", req.URL, opts.AllowRemote)
		},
	}
}

func GuardedDialContext(allowRemote bool) func(context.Context, string, string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := resolveDialIPs("endpoint", host, network, allowRemote)
		if err != nil {
			return nil, err
		}
		var lastErr error
		for _, ip := range ips {
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, fmt.Errorf("%s has no address compatible with %s", "endpoint", network)
	}
}

type guardedRoundTripper struct {
	base        http.RoundTripper
	allowRemote bool
}

func (rt guardedRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if err := ValidateRequestURL("request URL", req.URL, rt.allowRemote); err != nil {
		return nil, err
	}
	return rt.base.RoundTrip(req)
}

func resolveDialIPs(field, rawHost, network string, allowRemote bool) ([]net.IP, error) {
	host := normalizeHost(strings.Trim(rawHost, "[]"))
	if host == "" {
		return nil, fmt.Errorf("%s must be an absolute http(s) URL", field)
	}
	if _, blocked := blockedHosts[host]; blocked {
		return nil, fmt.Errorf("%s points to a blocked metadata host", field)
	}
	if allowRemote && (host == "localhost" || strings.HasSuffix(host, ".localhost")) {
		return nil, fmt.Errorf("%s must not target localhost when remote access is enabled", field)
	}
	if ip := net.ParseIP(host); ip != nil {
		if err := validateEndpointIP(field, ip, allowRemote); err != nil {
			return nil, err
		}
		if !ipMatchesNetwork(ip, network) {
			return nil, fmt.Errorf("%s has no address compatible with %s", field, network)
		}
		return []net.IP{ip}, nil
	}
	if canonical, err := lookupEndpointCNAME(host); err == nil {
		canonical = normalizeHost(canonical)
		if _, blocked := blockedHosts[canonical]; blocked {
			return nil, fmt.Errorf("%s points to a blocked metadata host", field)
		}
		if allowRemote && (canonical == "localhost" || strings.HasSuffix(canonical, ".localhost")) {
			return nil, fmt.Errorf("%s must not target localhost when remote access is enabled", field)
		}
	}
	addrs, err := lookupEndpointIPAddr(host)
	if err != nil || len(addrs) == 0 {
		return nil, fmt.Errorf("%s host could not be resolved", field)
	}
	selected := make([]net.IP, 0, len(addrs))
	for _, addr := range addrs {
		if err := validateEndpointIP(field, addr.IP, allowRemote); err != nil {
			return nil, err
		}
		if ipMatchesNetwork(addr.IP, network) {
			selected = append(selected, addr.IP)
		}
	}
	if len(selected) == 0 {
		return nil, fmt.Errorf("%s has no address compatible with %s", field, network)
	}
	return selected, nil
}

func ipMatchesNetwork(ip net.IP, network string) bool {
	switch network {
	case "tcp4":
		return ip.To4() != nil
	case "tcp6":
		return ip.To4() == nil
	default:
		return true
	}
}
