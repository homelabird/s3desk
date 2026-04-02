package api

import (
	"net/http"
	"testing"
)

func TestNormalizeUploadMode(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "staging", in: "staging", want: uploadModeStaging},
		{name: "direct uppercase", in: " DIRECT ", want: uploadModeDirect},
		{name: "presigned mixed case", in: "PreSigned", want: uploadModePresigned},
		{name: "empty", in: "", want: ""},
		{name: "unknown", in: "chunked", want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeUploadMode(tc.in); got != tc.want {
				t.Fatalf("normalizeUploadMode(%q)=%q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestParseUploadChunkHeaders(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name           string
		headers        http.Header
		chunkIndexRaw  string
		withoutSizes   bool
		wantErrMessage string
		wantRelPath    string
		wantTotal      int
		wantIndex      int
		wantChunkSize  int64
		wantFileSize   int64
	}{
		{
			name:          "valid with sizes",
			headers:       http.Header{"X-Upload-Chunk-Total": {"2"}, "X-Upload-Relative-Path": {"nested/file.txt"}, "X-Upload-Chunk-Size": {"5"}, "X-Upload-File-Size": {"10"}},
			chunkIndexRaw: "1",
			wantRelPath:   "nested/file.txt",
			wantTotal:     2,
			wantIndex:     1,
			wantChunkSize: 5,
			wantFileSize:  10,
		},
		{
			name:          "valid without sizes",
			headers:       http.Header{"X-Upload-Chunk-Total": {"3"}, "X-Upload-Relative-Path": {"chunked/file.txt"}},
			chunkIndexRaw: "2",
			withoutSizes:  true,
			wantRelPath:   "chunked/file.txt",
			wantTotal:     3,
			wantIndex:     2,
		},
		{
			name:           "missing required headers",
			headers:        http.Header{},
			chunkIndexRaw:  "0",
			wantErrMessage: "chunk uploads require X-Upload-Chunk-Total and X-Upload-Relative-Path",
		},
		{
			name:           "invalid chunk index",
			headers:        http.Header{"X-Upload-Chunk-Total": {"2"}, "X-Upload-Relative-Path": {"file.txt"}},
			chunkIndexRaw:  "x",
			wantErrMessage: "invalid X-Upload-Chunk-Index",
		},
		{
			name:           "invalid chunk total",
			headers:        http.Header{"X-Upload-Chunk-Total": {"0"}, "X-Upload-Relative-Path": {"file.txt"}},
			chunkIndexRaw:  "0",
			wantErrMessage: "invalid X-Upload-Chunk-Total",
		},
		{
			name:           "chunk index out of range",
			headers:        http.Header{"X-Upload-Chunk-Total": {"2"}, "X-Upload-Relative-Path": {"file.txt"}},
			chunkIndexRaw:  "2",
			wantErrMessage: "chunk index out of range",
		},
		{
			name:           "invalid chunk size",
			headers:        http.Header{"X-Upload-Chunk-Total": {"2"}, "X-Upload-Relative-Path": {"file.txt"}, "X-Upload-Chunk-Size": {"0"}, "X-Upload-File-Size": {"10"}},
			chunkIndexRaw:  "1",
			wantErrMessage: "invalid X-Upload-Chunk-Size",
		},
		{
			name:           "invalid file size",
			headers:        http.Header{"X-Upload-Chunk-Total": {"2"}, "X-Upload-Relative-Path": {"file.txt"}, "X-Upload-Chunk-Size": {"5"}, "X-Upload-File-Size": {"0"}},
			chunkIndexRaw:  "1",
			wantErrMessage: "invalid X-Upload-File-Size",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var (
				got       uploadChunkHeaderValues
				uploadErr *uploadHTTPError
			)
			if tc.withoutSizes {
				got, uploadErr = parseUploadChunkHeadersWithoutSizes(tc.headers, tc.chunkIndexRaw, true)
			} else {
				got, uploadErr = parseUploadChunkHeaders(tc.headers, tc.chunkIndexRaw, true)
			}

			if tc.wantErrMessage != "" {
				if uploadErr == nil {
					t.Fatalf("expected error %q, got nil", tc.wantErrMessage)
				}
				if uploadErr.message != tc.wantErrMessage {
					t.Fatalf("error message=%q, want %q", uploadErr.message, tc.wantErrMessage)
				}
				return
			}
			if uploadErr != nil {
				t.Fatalf("unexpected error: %+v", uploadErr)
			}
			if got.relPath != tc.wantRelPath || got.total != tc.wantTotal || got.index != tc.wantIndex {
				t.Fatalf("got path=%q total=%d index=%d, want path=%q total=%d index=%d", got.relPath, got.total, got.index, tc.wantRelPath, tc.wantTotal, tc.wantIndex)
			}
			if got.chunkSize != tc.wantChunkSize || got.fileSize != tc.wantFileSize {
				t.Fatalf("got chunkSize=%d fileSize=%d, want chunkSize=%d fileSize=%d", got.chunkSize, got.fileSize, tc.wantChunkSize, tc.wantFileSize)
			}
		})
	}
}
