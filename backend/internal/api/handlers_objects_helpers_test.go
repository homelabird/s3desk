package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestParseIntQueryClamped(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		query      string
		param      string
		defaultVal int
		min        int
		max        int
		want       int
		wantErr    bool
	}{
		{"missing param uses default", "", "limit", 50, 1, 200, 50, false},
		{"valid value", "limit=100", "limit", 50, 1, 200, 100, false},
		{"clamps below min", "limit=0", "limit", 50, 1, 200, 1, false},
		{"clamps above max", "limit=999", "limit", 50, 1, 200, 200, false},
		{"non-integer returns default and error", "limit=abc", "limit", 50, 1, 200, 50, true},
		{"negative clamped to min", "limit=-5", "limit", 50, 1, 200, 1, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			url := "/test"
			if tt.query != "" {
				url += "?" + tt.query
			}
			r := httptest.NewRequest(http.MethodGet, url, nil)
			got, err := parseIntQueryClamped(r, tt.param, tt.defaultVal, tt.min, tt.max)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseIntQueryClamped() err = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("parseIntQueryClamped() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestParseSizeQueryParam(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		query   string
		param   string
		want    *int64
		wantErr bool
	}{
		{"missing param", "", "minSize", nil, false},
		{"valid value", "minSize=1024", "minSize", ptrInt64(1024), false},
		{"zero value", "minSize=0", "minSize", ptrInt64(0), false},
		{"negative returns error", "minSize=-1", "minSize", nil, true},
		{"non-integer returns error", "minSize=abc", "minSize", nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			url := "/test"
			if tt.query != "" {
				url += "?" + tt.query
			}
			r := httptest.NewRequest(http.MethodGet, url, nil)
			got, err := parseSizeQueryParam(r, tt.param)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseSizeQueryParam() err = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.want == nil && got != nil {
				t.Fatalf("parseSizeQueryParam() = %v, want nil", *got)
			}
			if tt.want != nil {
				if got == nil {
					t.Fatalf("parseSizeQueryParam() = nil, want %d", *tt.want)
				}
				if *got != *tt.want {
					t.Fatalf("parseSizeQueryParam() = %d, want %d", *got, *tt.want)
				}
			}
		})
	}
}

func TestParseTimeQueryParam(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		query   string
		want    string
		wantErr bool
	}{
		{"missing param", "", "", false},
		{"rfc3339 value", "modifiedAfter=2024-01-15T10:30:00Z", "2024-01-15T10:30:00Z", false},
		{"invalid value", "modifiedAfter=not-a-time", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			url := "/test"
			if tt.query != "" {
				url += "?" + tt.query
			}
			r := httptest.NewRequest(http.MethodGet, url, nil)
			got, err := parseTimeQueryParam(r, "modifiedAfter")
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseTimeQueryParam() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && !strings.HasPrefix(got, tt.want[:min(len(tt.want), len(got))]) && got != tt.want {
				t.Fatalf("parseTimeQueryParam() = %q, want prefix %q", got, tt.want)
			}
		})
	}
}

func TestWriteLinesToTempFile(t *testing.T) {
	t.Parallel()

	lines := []string{"key1", "key2", "key3"}
	path, err := writeLinesToTempFile("test-*.txt", lines)
	if err != nil {
		t.Fatalf("writeLinesToTempFile() err = %v", err)
	}
	defer func() { _ = os.Remove(path) }()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() err = %v", err)
	}

	want := "key1\nkey2\nkey3\n"
	if string(data) != want {
		t.Fatalf("file content = %q, want %q", string(data), want)
	}
}

func TestHasUnexpectedFields(t *testing.T) {
	t.Parallel()

	s := "value"
	b := true

	tests := []struct {
		name   string
		fields []any
		want   bool
	}{
		{"all nil", []any{(*string)(nil), (*bool)(nil)}, false},
		{"string set", []any{&s, (*bool)(nil)}, true},
		{"bool set", []any{(*string)(nil), &b}, true},
		{"empty", []any{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := hasUnexpectedFields(tt.fields...); got != tt.want {
				t.Fatalf("hasUnexpectedFields() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestListPaginatorAddPrefix(t *testing.T) {
	t.Parallel()

	resp := models.ListObjectsResponse{
		CommonPrefixes: make([]string, 0),
	}

	pag := listPaginator{
		token:           "",
		maxKeys:         3,
		foundToken:      true,
		commonPrefixSet: make(map[string]struct{}),
		cancel:          func() {},
	}

	// Add first prefix
	if err := pag.addPrefix("p:dir1/", "dir1/", &resp); err != nil {
		t.Fatalf("addPrefix() err = %v", err)
	}
	if len(resp.CommonPrefixes) != 1 {
		t.Fatalf("CommonPrefixes len = %d, want 1", len(resp.CommonPrefixes))
	}

	// Duplicate prefix should be skipped
	if err := pag.addPrefix("p:dir1/", "dir1/", &resp); err != nil {
		t.Fatalf("addPrefix() duplicate err = %v", err)
	}
	if len(resp.CommonPrefixes) != 1 {
		t.Fatalf("CommonPrefixes len after dup = %d, want 1", len(resp.CommonPrefixes))
	}

	// Add until truncation
	_ = pag.addPrefix("p:dir2/", "dir2/", &resp)
	err := pag.addPrefix("p:dir3/", "dir3/", &resp)
	if err != errRcloneListStop {
		t.Fatalf("expected errRcloneListStop at maxKeys, got %v", err)
	}
	if !pag.truncated {
		t.Fatal("expected truncated = true")
	}
	if pag.nextToken != "p:dir3/" {
		t.Fatalf("nextToken = %q, want %q", pag.nextToken, "p:dir3/")
	}
}

func TestListPaginatorAdvanceToken(t *testing.T) {
	t.Parallel()

	pag := listPaginator{
		token:      "o:file.txt",
		foundToken: false,
	}

	// Before matching token, should return false
	if pag.advanceToken("o:other.txt", "other.txt") {
		t.Fatal("expected false before token match")
	}

	// Matching token should advance
	if pag.advanceToken("o:file.txt", "file.txt") {
		t.Fatal("expected false on the matching entry itself (just advances state)")
	}
	if !pag.foundToken {
		t.Fatal("expected foundToken = true after match")
	}

	// After token found, should return true
	if !pag.advanceToken("o:next.txt", "next.txt") {
		t.Fatal("expected true after token found")
	}
}

func TestValidateCreateProfileProvider(t *testing.T) {
	t.Parallel()

	region := "us-east-1"
	accessKey := "AKID"
	secretKey := "secret"
	endpoint := "https://s3.example.com"

	tests := []struct {
		name    string
		req     models.ProfileCreateRequest
		wantErr string
	}{
		{
			name: "valid s3_compatible",
			req: models.ProfileCreateRequest{
				Provider:        models.ProfileProviderS3Compatible,
				Endpoint:        &endpoint,
				Region:          &region,
				AccessKeyID:     &accessKey,
				SecretAccessKey: &secretKey,
			},
			wantErr: "",
		},
		{
			name: "s3_compatible missing region",
			req: models.ProfileCreateRequest{
				Provider:        models.ProfileProviderS3Compatible,
				Endpoint:        &endpoint,
				AccessKeyID:     &accessKey,
				SecretAccessKey: &secretKey,
			},
			wantErr: "region is required",
		},
		{
			name: "s3 with azure fields",
			req: models.ProfileCreateRequest{
				Provider:        models.ProfileProviderS3Compatible,
				Endpoint:        &endpoint,
				Region:          &region,
				AccessKeyID:     &accessKey,
				SecretAccessKey: &secretKey,
				AccountName:     &endpoint, // unexpected
			},
			wantErr: "unexpected fields for s3 provider",
		},
		{
			name: "unknown provider",
			req: models.ProfileCreateRequest{
				Provider: "unknown_provider",
			},
			wantErr: "unknown provider: unknown_provider",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateCreateProfileProvider(&tt.req)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			} else {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
				}
			}
		})
	}
}

func ptrInt64(v int64) *int64 { return &v }
