// Package objectlisting implements bounded, provider-cursor-based pagination.
// Provider I/O is injected so pagination can be tested without a storage server.
package objectlisting

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"s3desk/internal/models"
)

const TokenPrefix = "s3v2."
const GCSTokenPrefix = "gcsv1."
const AzureTokenPrefix = "azv1."
const OCITokenPrefix = "ociv1."
const MaxPagesPerRequest = 8
const maxTokenBytes = 16384

var ErrInvalidToken = errors.New("invalid or mismatched S3 continuation token; refresh the listing")
var ErrInvalidPage = errors.New("invalid S3 pagination response")

type Query struct {
	ProfileID, Bucket, Prefix, Delimiter string
	Provider                             string
	TokenPrefix                          string
	PrefixesOnly                         bool
	MaxKeys                              int
	Token                                string
}
type Request struct {
	Bucket, Prefix, Delimiter, ContinuationToken string
	MaxKeys                                      int
}
type Page struct {
	Items          []models.ObjectItem
	CommonPrefixes []string
	NextToken      string
	IsTruncated    bool
}
type Fetch func(context.Context, Request) (Page, error)
type cursor struct {
	Scope [32]byte `json:"s"`
	Next  string   `json:"n"`
}

func IsToken(token string) bool {
	return strings.HasPrefix(token, TokenPrefix) || strings.HasPrefix(token, GCSTokenPrefix) || strings.HasPrefix(token, AzureTokenPrefix) || strings.HasPrefix(token, OCITokenPrefix)
}
func tokenPrefix(q Query) string {
	if q.TokenPrefix != "" {
		return q.TokenPrefix
	}
	return TokenPrefix
}
func scope(q Query) [32]byte {
	values := []any{q.ProfileID, q.Bucket, q.Prefix, q.Delimiter, q.PrefixesOnly}
	if q.Provider != "" {
		values = append(values, q.Provider)
	}
	raw, _ := json.Marshal(values)
	return sha256.Sum256(raw)
}
func decodeToken(q Query) (string, error) {
	if q.Token == "" {
		return "", nil
	}
	if !strings.HasPrefix(q.Token, tokenPrefix(q)) || len(q.Token) > maxTokenBytes {
		return "", ErrInvalidToken
	}
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(q.Token, tokenPrefix(q)))
	if err != nil {
		return "", ErrInvalidToken
	}
	var c cursor
	if json.Unmarshal(data, &c) != nil || c.Scope != scope(q) || c.Next == "" {
		return "", ErrInvalidToken
	}
	return c.Next, nil
}
func encodeToken(q Query, next string) (string, error) {
	data, _ := json.Marshal(cursor{Scope: scope(q), Next: next})
	token := tokenPrefix(q) + base64.RawURLEncoding.EncodeToString(data)
	if len(token) > maxTokenBytes {
		return "", ErrInvalidPage
	}
	return token, nil
}

// DecodeKey decodes S3's encoding-type=url, NOT form encoding: a '+' is a
// literal plus, not a space. Unencoded keys containing '%' must stay untouched.
func DecodeKey(raw string, encoded bool) (string, error) {
	if !encoded {
		return raw, nil
	}
	return url.PathUnescape(raw)
}

// List resumes directly at the provider's opaque cursor rather than replaying
// every earlier page in a fresh rclone process. Filtering may return a short or
// empty page WITH a continuation token; consumers must follow that token.
func List(ctx context.Context, q Query, fetch Fetch) (*models.ListObjectsResponse, error) {
	if q.MaxKeys < 1 || q.MaxKeys > 1000 || q.Bucket == "" || (q.PrefixesOnly && q.Delimiter != "/") {
		return nil, ErrInvalidPage
	}
	next, err := decodeToken(q)
	if err != nil {
		return nil, err
	}
	out := &models.ListObjectsResponse{Bucket: q.Bucket, Prefix: q.Prefix, Delimiter: q.Delimiter,
		Items: make([]models.ObjectItem, 0, q.MaxKeys), CommonPrefixes: make([]string, 0)}
	prefixes := make(map[string]bool)
	seenTokens := map[string]bool{next: true}
	addPrefix := func(p string) {
		if p != "" && p != q.Prefix && !prefixes[p] {
			prefixes[p] = true
			out.CommonPrefixes = append(out.CommonPrefixes, p)
		}
	}
	for n := 0; n < MaxPagesPerRequest; n++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		remaining := q.MaxKeys - len(out.Items) - len(out.CommonPrefixes)
		page, err := fetch(ctx, Request{Bucket: q.Bucket, Prefix: q.Prefix, Delimiter: q.Delimiter, ContinuationToken: next, MaxKeys: remaining})
		if err != nil {
			return nil, err
		}
		// Do not silently discard results when a broken endpoint ignores MaxKeys.
		if len(page.Items)+len(page.CommonPrefixes) > remaining {
			return nil, ErrInvalidPage
		}
		for _, p := range page.CommonPrefixes {
			addPrefix(p)
		}
		for _, item := range page.Items {
			if item.Key == "" {
				continue
			}
			if q.Delimiter == "/" && item.Size == 0 && strings.HasSuffix(item.Key, "/") {
				addPrefix(item.Key)
				continue
			}
			if !q.PrefixesOnly {
				out.Items = append(out.Items, item)
			}
		}
		if !page.IsTruncated {
			return out, nil
		}
		if page.NextToken == "" || seenTokens[page.NextToken] {
			return nil, ErrInvalidPage
		}
		next = page.NextToken
		seenTokens[next] = true
		if len(out.Items)+len(out.CommonPrefixes) >= q.MaxKeys || n == MaxPagesPerRequest-1 {
			token, err := encodeToken(q, next)
			if err != nil {
				return nil, err
			}
			out.IsTruncated = true
			out.NextContinuationToken = &token
			return out, nil
		}
	}
	return nil, ErrInvalidPage
}
