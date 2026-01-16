package rcloneconfig

import (
	"fmt"
	"strings"
)

// RemoteName is the name used in generated rclone config files.
const RemoteName = "remote"

// NormalizePathInput normalizes a user-provided key/prefix.
//
// When preserveLeadingSlash is false (default), a leading "/" is removed to avoid creating
// an empty path component in rclone ("bucket//key").
func NormalizePathInput(value string, preserveLeadingSlash bool) string {
	value = strings.TrimSpace(value)
	if preserveLeadingSlash {
		return value
	}
	return strings.TrimPrefix(value, "/")
}

// NormalizePrefix normalizes a prefix that is intended to be used as a directory.
// It ensures the prefix ends with a trailing slash when non-empty.
func NormalizePrefix(prefix string, preserveLeadingSlash bool) string {
	p := NormalizePathInput(prefix, preserveLeadingSlash)
	if p == "" {
		return ""
	}
	if !strings.HasSuffix(p, "/") {
		p += "/"
	}
	return p
}

func RemoteBucket(bucket string) string {
	return fmt.Sprintf("%s:%s", RemoteName, strings.TrimSpace(bucket))
}

func RemoteDir(bucket, prefix string, preserveLeadingSlash bool) string {
	p := NormalizePrefix(prefix, preserveLeadingSlash)
	if p == "" {
		return RemoteBucket(bucket)
	}
	return fmt.Sprintf("%s:%s/%s", RemoteName, strings.TrimSpace(bucket), p)
}

func RemoteObject(bucket, key string, preserveLeadingSlash bool) string {
	k := NormalizePathInput(key, preserveLeadingSlash)
	if k == "" {
		return RemoteBucket(bucket)
	}
	return fmt.Sprintf("%s:%s/%s", RemoteName, strings.TrimSpace(bucket), k)
}
