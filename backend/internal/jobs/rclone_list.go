package jobs

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

type rcloneListEntry struct {
	Path     string            `json:"Path"`
	Name     string            `json:"Name"`
	Size     int64             `json:"Size"`
	ModTime  string            `json:"ModTime"`
	MimeType string            `json:"MimeType"`
	IsDir    bool              `json:"IsDir"`
	IsBucket bool              `json:"IsBucket"`
	Hashes   map[string]string `json:"Hashes"`
	Metadata map[string]string `json:"Metadata"`
}

var errRcloneListStop = errors.New("rclone list stop")

func decodeRcloneList(r io.Reader, onEntry func(entry rcloneListEntry) error) error {
	dec := json.NewDecoder(r)
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	delim, ok := tok.(json.Delim)
	if !ok || delim != '[' {
		return fmt.Errorf("unexpected rclone lsjson output")
	}
	for dec.More() {
		var entry rcloneListEntry
		if err := dec.Decode(&entry); err != nil {
			return err
		}
		if err := onEntry(entry); err != nil {
			return err
		}
	}
	if _, err := dec.Token(); err != nil {
		return err
	}
	return nil
}

func rcloneETagFromHashes(hashes map[string]string) string {
	if len(hashes) == 0 {
		return ""
	}
	if v := strings.TrimSpace(hashes["ETag"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(hashes["etag"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(hashes["MD5"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(hashes["md5"]); v != "" {
		return v
	}
	for _, v := range hashes {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
}

func rcloneParseTime(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if t, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return t.UTC().Format(time.RFC3339Nano)
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t.UTC().Format(time.RFC3339Nano)
	}
	return ""
}

func rcloneObjectKey(prefix, name string, preserveLeadingSlash bool) string {
	prefix = normalizeKeyInput(prefix, preserveLeadingSlash)
	name = normalizeKeyInput(name, preserveLeadingSlash)
	if prefix == "" {
		return name
	}
	if name == "" {
		return strings.TrimSuffix(prefix, "/")
	}
	if strings.HasSuffix(prefix, "/") {
		return prefix + name
	}
	return prefix + "/" + name
}
