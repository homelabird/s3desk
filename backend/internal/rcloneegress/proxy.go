package rcloneegress

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"s3desk/internal/profileendpoint"
)

const (
	proxyReadHeaderTimeout = 5 * time.Second
	proxyIdleTimeout       = 30 * time.Second
)

// Proxy is a short-lived, authenticated loopback HTTP proxy for one rclone
// invocation. All outbound proxy dials use profileendpoint's guarded resolver.
type Proxy struct {
	allowRemote bool
	username    string
	password    string
	proxyURL    string
	ctx         context.Context
	cancel      context.CancelFunc
	server      *http.Server
	transport   *http.Transport
	serveDone   chan struct{}

	connMu sync.Mutex
	conns  map[net.Conn]struct{}
	closed bool

	closeOnce sync.Once
	closeErr  error
}

// Start binds a loopback proxy and returns its authenticated URL and child
// process environment. A failed proxy cannot silently fall back to direct
// rclone egress.
func Start(ctx context.Context, allowRemote bool) (*Proxy, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	password, err := randomToken()
	if err != nil {
		return nil, fmt.Errorf("create rclone proxy credential: %w", err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen for rclone proxy: %w", err)
	}

	proxyCtx, cancel := context.WithCancel(ctx)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = profileendpoint.GuardedDialContext(allowRemote)
	proxy := &Proxy{
		allowRemote: allowRemote,
		username:    "s3desk",
		password:    password,
		proxyURL: (&url.URL{
			Scheme: "http",
			Host:   listener.Addr().String(),
			User:   url.UserPassword("s3desk", password),
		}).String(),
		ctx:       proxyCtx,
		cancel:    cancel,
		transport: transport,
		serveDone: make(chan struct{}),
		conns:     make(map[net.Conn]struct{}),
	}
	proxy.server = &http.Server{
		Handler:           http.HandlerFunc(proxy.handle),
		ReadHeaderTimeout: proxyReadHeaderTimeout,
		IdleTimeout:       proxyIdleTimeout,
		MaxHeaderBytes:    64 << 10,
	}

	go proxy.serve(listener)
	go func() {
		<-proxyCtx.Done()
		_ = proxy.Close()
	}()
	return proxy, nil
}

func (p *Proxy) serve(listener net.Listener) {
	defer close(p.serveDone)
	_ = p.server.Serve(listener)
}

// URL returns the authenticated proxy URL for rclone.
func (p *Proxy) URL() string {
	if p == nil {
		return ""
	}
	return p.proxyURL
}

// Environment returns base with all common proxy variables forced to this
// proxy and NO_PROXY cleared so rclone cannot bypass the guarded dialer.
func (p *Proxy) Environment(base []string) []string {
	if p == nil {
		return append([]string(nil), base...)
	}
	values := []struct {
		key   string
		value string
	}{
		{"HTTP_PROXY", p.proxyURL},
		{"HTTPS_PROXY", p.proxyURL},
		{"ALL_PROXY", p.proxyURL},
		{"NO_PROXY", ""},
		{"http_proxy", p.proxyURL},
		{"https_proxy", p.proxyURL},
		{"all_proxy", p.proxyURL},
		{"no_proxy", ""},
	}
	replaced := make(map[string]struct{}, len(values))
	for _, item := range values {
		replaced[strings.ToUpper(item.key)] = struct{}{}
	}
	env := make([]string, 0, len(base)+len(values))
	for _, entry := range base {
		key, _, ok := strings.Cut(entry, "=")
		if ok {
			if _, replace := replaced[strings.ToUpper(key)]; replace {
				continue
			}
		}
		env = append(env, entry)
	}
	for _, item := range values {
		env = append(env, item.key+"="+item.value)
	}
	return env
}

// Close stops the proxy and closes any active CONNECT tunnels.
func (p *Proxy) Close() error {
	if p == nil {
		return nil
	}
	p.closeOnce.Do(func() {
		p.connMu.Lock()
		p.closed = true
		active := make([]net.Conn, 0, len(p.conns))
		for conn := range p.conns {
			active = append(active, conn)
		}
		p.connMu.Unlock()

		p.cancel()
		p.closeErr = p.server.Close()
		p.transport.CloseIdleConnections()
		for _, conn := range active {
			_ = conn.Close()
		}
	})
	<-p.serveDone
	return p.closeErr
}

func (p *Proxy) handle(w http.ResponseWriter, r *http.Request) {
	if !p.authorized(r) {
		w.Header().Set("Proxy-Authenticate", "Basic realm=\"s3desk-rclone\"")
		http.Error(w, "proxy authentication required", http.StatusProxyAuthRequired)
		return
	}
	if r.Method == http.MethodConnect {
		p.handleConnect(w, r)
		return
	}
	p.handleHTTP(w, r)
}

func (p *Proxy) authorized(r *http.Request) bool {
	raw := strings.TrimSpace(r.Header.Get("Proxy-Authorization"))
	const prefix = "Basic "
	if !strings.HasPrefix(raw, prefix) {
		return false
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(strings.TrimPrefix(raw, prefix)))
	if err != nil {
		return false
	}
	username, password, ok := strings.Cut(string(decoded), ":")
	if !ok || username != p.username {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(password), []byte(p.password)) == 1
}

func (p *Proxy) handleHTTP(w http.ResponseWriter, r *http.Request) {
	if err := profileendpoint.ValidateRequestURL("rclone proxy target", r.URL, p.allowRemote); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	ctx, finish := p.requestContext(r)
	defer finish()

	req := r.Clone(ctx)
	req.RequestURI = ""
	req.Host = r.URL.Host
	req.Header = r.Header.Clone()
	removeHopByHopHeaders(req.Header)
	req.Header.Del("Proxy-Authorization")
	req.Header.Del("Proxy-Connection")

	resp, err := (&http.Client{
		Transport:     p.transport,
		CheckRedirect: guardedRedirect(p.allowRemote),
	}).Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	copyProxyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *Proxy) handleConnect(w http.ResponseWriter, r *http.Request) {
	target := strings.TrimSpace(r.Host)
	if target == "" {
		target = strings.TrimSpace(r.URL.Host)
	}
	if err := validateConnectTarget(target, p.allowRemote); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	ctx, finish := p.requestContext(r)
	defer finish()
	upstream, err := profileendpoint.GuardedDialContext(p.allowRemote)(ctx, "tcp", target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		_ = upstream.Close()
		http.Error(w, "CONNECT is not supported", http.StatusHTTPVersionNotSupported)
		return
	}
	client, buffered, err := hijacker.Hijack()
	if err != nil {
		_ = upstream.Close()
		return
	}
	if _, err := buffered.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
		_ = client.Close()
		_ = upstream.Close()
		return
	}
	if err := buffered.Flush(); err != nil {
		_ = client.Close()
		_ = upstream.Close()
		return
	}
	if !p.track(client) {
		_ = client.Close()
		_ = upstream.Close()
		return
	}
	if !p.track(upstream) {
		p.untrack(client)
		_ = client.Close()
		_ = upstream.Close()
		return
	}
	defer func() {
		p.untrack(client)
		p.untrack(upstream)
		_ = client.Close()
		_ = upstream.Close()
	}()

	stop := sync.OnceFunc(func() {
		_ = client.Close()
		_ = upstream.Close()
	})
	done := make(chan struct{}, 2)
	go func() {
		_, _ = io.Copy(upstream, buffered)
		done <- struct{}{}
	}()
	go func() {
		_, _ = io.Copy(client, upstream)
		done <- struct{}{}
	}()
	go func() {
		<-ctx.Done()
		stop()
	}()
	<-done
	stop()
	<-done
}

func (p *Proxy) requestContext(r *http.Request) (context.Context, func()) {
	ctx, cancel := context.WithCancel(p.ctx)
	stop := context.AfterFunc(r.Context(), cancel)
	return ctx, func() {
		stop()
		cancel()
	}
}

func (p *Proxy) track(conn net.Conn) bool {
	p.connMu.Lock()
	defer p.connMu.Unlock()
	if p.closed {
		return false
	}
	p.conns[conn] = struct{}{}
	return true
}

func (p *Proxy) untrack(conn net.Conn) {
	p.connMu.Lock()
	delete(p.conns, conn)
	p.connMu.Unlock()
}

func validateConnectTarget(target string, allowRemote bool) error {
	host, port, err := net.SplitHostPort(target)
	if err != nil || host == "" || port == "" {
		return fmt.Errorf("rclone proxy target must be host:port")
	}
	targetURL := &url.URL{Scheme: "https", Host: net.JoinHostPort(host, port)}
	return profileendpoint.ValidateRequestURL("rclone proxy target", targetURL, allowRemote)
}

func guardedRedirect(allowRemote bool) func(*http.Request, []*http.Request) error {
	return func(req *http.Request, _ []*http.Request) error {
		return profileendpoint.ValidateRequestURL("rclone proxy redirect", req.URL, allowRemote)
	}
}

func copyProxyHeaders(dst, src http.Header) {
	for key, values := range src {
		if isHopByHopHeader(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func removeHopByHopHeaders(headers http.Header) {
	for _, value := range headers.Values("Connection") {
		for _, key := range strings.Split(value, ",") {
			headers.Del(strings.TrimSpace(key))
		}
	}
	for key := range headers {
		if isHopByHopHeader(key) {
			headers.Del(key)
		}
	}
}

func isHopByHopHeader(key string) bool {
	switch strings.ToLower(key) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
		"proxy-connection", "te", "trailer", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func randomToken() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
