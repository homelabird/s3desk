package jobs

import (
	"net/http"
	"net/url"
	"strings"
)

func detectStorageType(endpoint string, headers http.Header) (storageType string, source string) {
	if storageType = storageTypeFromServerHeader(headers); storageType != "" {
		return storageType, "server-header"
	}
	if storageType = storageTypeFromEndpoint(endpoint); storageType != "" {
		return storageType, "endpoint"
	}
	if strings.TrimSpace(endpoint) != "" {
		return "s3-compatible", "default"
	}
	return "unknown", "none"
}

func storageTypeFromServerHeader(headers http.Header) string {
	if headers == nil {
		return ""
	}
	server := strings.ToLower(strings.TrimSpace(headers.Get("Server")))
	if server == "" {
		return ""
	}
	switch {
	case strings.Contains(server, "ceph"):
		return "ceph"
	case strings.Contains(server, "amazon") && strings.Contains(server, "s3"):
		return "aws-s3"
	}
	return ""
}

func storageTypeFromEndpoint(endpoint string) string {
	host := endpointHost(endpoint)
	if host == "" {
		return ""
	}
	switch {
	case isAWSHost(host):
		return "aws-s3"
	case isCephHost(host):
		return "ceph"
	default:
		return ""
	}
}

func endpointHost(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return ""
	}
	parsed, err := url.Parse(endpoint)
	if err == nil && parsed.Hostname() != "" {
		return strings.ToLower(parsed.Hostname())
	}
	parsed, err = url.Parse("https://" + endpoint)
	if err != nil {
		return ""
	}
	return strings.ToLower(parsed.Hostname())
}

func isAWSHost(host string) bool {
	return strings.HasSuffix(host, ".amazonaws.com") || strings.HasSuffix(host, ".amazonaws.com.cn") || host == "amazonaws.com"
}

func isCephHost(host string) bool {
	return strings.Contains(host, "ceph") || strings.Contains(host, "rgw")
}
