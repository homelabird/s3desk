package api

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestBuildMultipartCompletionParts(t *testing.T) {
	cases := []struct {
		name           string
		parts          []models.UploadMultipartCompletePart
		wantErrMessage string
		wantNumbers    []int32
		wantETags      []string
	}{
		{
			name: "normalizes quotes and sorts",
			parts: []models.UploadMultipartCompletePart{
				{Number: 2, ETag: `etag-2`},
				{Number: 1, ETag: `"etag-1"`},
			},
			wantNumbers: []int32{1, 2},
			wantETags:   []string{`"etag-1"`, `"etag-2"`},
		},
		{
			name: "rejects zero part number",
			parts: []models.UploadMultipartCompletePart{
				{Number: 0, ETag: "etag-1"},
			},
			wantErrMessage: "invalid part number",
		},
		{
			name: "rejects blank etag",
			parts: []models.UploadMultipartCompletePart{
				{Number: 1, ETag: "   "},
			},
			wantErrMessage: "etag is required",
		},
		{
			name: "rejects oversized part number",
			parts: []models.UploadMultipartCompletePart{
				{Number: maxMultipartUploadParts + 1, ETag: "etag-1"},
			},
			wantErrMessage: "invalid part number",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			completed, uploadErr := buildMultipartCompletionParts(tc.parts)
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
			if got := len(completed); got != len(tc.wantNumbers) {
				t.Fatalf("part count=%d, want %d", got, len(tc.wantNumbers))
			}
			for i := range completed {
				if *completed[i].PartNumber != tc.wantNumbers[i] {
					t.Fatalf("partNumber[%d]=%d, want %d", i, *completed[i].PartNumber, tc.wantNumbers[i])
				}
				if *completed[i].ETag != tc.wantETags[i] {
					t.Fatalf("etag[%d]=%q, want %q", i, *completed[i].ETag, tc.wantETags[i])
				}
			}
		})
	}
}

func TestExpectedMultipartPartCount(t *testing.T) {
	cases := []struct {
		name            string
		fileSize        int64
		chunkSize       int64
		want            int
		wantErrContains string
	}{
		{name: "exact division", fileSize: 10, chunkSize: 5, want: 2},
		{name: "remainder adds final part", fileSize: 11, chunkSize: 5, want: 3},
		{name: "rejects non-positive file size", fileSize: 0, chunkSize: 5, wantErrContains: "fileSize must be positive"},
		{name: "rejects non-positive chunk size", fileSize: 10, chunkSize: 0, wantErrContains: "chunkSize must be positive"},
		{name: "rejects too many parts", fileSize: int64(maxMultipartUploadParts) + 1, chunkSize: 1, wantErrContains: "multipart upload exceeds"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := expectedMultipartPartCount(tc.fileSize, tc.chunkSize)
			if tc.wantErrContains != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantErrContains)
				}
				if !strings.Contains(err.Error(), tc.wantErrContains) {
					t.Fatalf("error=%q, want to contain %q", err.Error(), tc.wantErrContains)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("count=%d, want %d", got, tc.want)
			}
		})
	}
}

func TestMultipartPartNumber(t *testing.T) {
	cases := []struct {
		name            string
		number          int
		want            int32
		wantErrContains string
	}{
		{name: "minimum valid", number: 1, want: 1},
		{name: "maximum valid", number: maxMultipartUploadParts, want: maxMultipartUploadParts},
		{name: "rejects zero", number: 0, wantErrContains: "invalid multipart part number"},
		{name: "rejects overflow", number: maxMultipartUploadParts + 1, wantErrContains: "invalid multipart part number"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := multipartPartNumber(tc.number)
			if tc.wantErrContains != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantErrContains)
				}
				if !strings.Contains(err.Error(), tc.wantErrContains) {
					t.Fatalf("error=%q, want to contain %q", err.Error(), tc.wantErrContains)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("partNumber=%d, want %d", got, tc.want)
			}
		})
	}
}

func TestBuildCompletedMultipartParts(t *testing.T) {
	part1 := int32(1)
	part2 := int32(2)
	etag1 := `"etag-1"`
	etag2 := `"etag-2"`

	cases := []struct {
		name          string
		parts         []types.Part
		expectedTotal int
		wantErr       error
		wantNumbers   []int32
		wantETags     []string
	}{
		{
			name: "orders contiguous parts",
			parts: []types.Part{
				{PartNumber: &part2, ETag: &etag2},
				{PartNumber: &part1, ETag: &etag1},
			},
			expectedTotal: 2,
			wantNumbers:   []int32{1, 2},
			wantETags:     []string{etag1, etag2},
		},
		{
			name: "rejects missing part",
			parts: []types.Part{
				{PartNumber: &part1, ETag: &etag1},
			},
			expectedTotal: 2,
			wantErr:       errUploadIncomplete,
		},
		{
			name: "rejects nil etag",
			parts: []types.Part{
				{PartNumber: &part1, ETag: &etag1},
				{PartNumber: &part2},
			},
			expectedTotal: 2,
			wantErr:       errUploadIncomplete,
		},
		{
			name: "ignores nil part number when required parts exist",
			parts: []types.Part{
				{ETag: &etag2},
				{PartNumber: &part1, ETag: &etag1},
			},
			expectedTotal: 1,
			wantNumbers:   []int32{1},
			wantETags:     []string{etag1},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			completed, err := buildCompletedMultipartParts(tc.parts, tc.expectedTotal)
			if tc.wantErr != nil {
				if err != tc.wantErr {
					t.Fatalf("err=%v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got := len(completed); got != len(tc.wantNumbers) {
				t.Fatalf("part count=%d, want %d", got, len(tc.wantNumbers))
			}
			for i := range completed {
				if *completed[i].PartNumber != tc.wantNumbers[i] {
					t.Fatalf("partNumber[%d]=%d, want %d", i, *completed[i].PartNumber, tc.wantNumbers[i])
				}
				if *completed[i].ETag != tc.wantETags[i] {
					t.Fatalf("etag[%d]=%q, want %q", i, *completed[i].ETag, tc.wantETags[i])
				}
			}
		})
	}
}

func TestBuildRemoteMultipartChunkStateFiltersUnexpectedParts(t *testing.T) {
	part1 := int32(1)
	part2 := int32(2)
	part3 := int32(3)
	size5 := int64(5)
	size2 := int64(2)
	size1 := int64(1)

	state := buildRemoteMultipartChunkState([]types.Part{
		{PartNumber: &part3, Size: &size1},
		{PartNumber: &part2, Size: &size2},
		{PartNumber: &part1, Size: &size5},
	}, store.MultipartUpload{
		ChunkSize: 5,
		FileSize:  11,
	})

	if !reflect.DeepEqual(state.Present, []int{0, 2}) {
		t.Fatalf("expected present [0 2], got %v", state.Present)
	}
}

func TestBuildStagingMultipartChunkStateRemovesWrongSizedChunk(t *testing.T) {
	chunkDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(0)), []byte("hello"), 0o600); err != nil {
		t.Fatalf("write chunk0: %v", err)
	}
	if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(1)), []byte("bad"), 0o600); err != nil {
		t.Fatalf("write chunk1: %v", err)
	}

	state := buildStagingMultipartChunkState(chunkDir, 2, 5, 10)
	if !reflect.DeepEqual(state.Present, []int{0}) {
		t.Fatalf("expected present [0], got %v", state.Present)
	}
	if _, err := os.Stat(filepath.Join(chunkDir, chunkPartName(1))); !os.IsNotExist(err) {
		t.Fatalf("expected wrong-sized chunk to be removed, got err=%v", err)
	}
}
