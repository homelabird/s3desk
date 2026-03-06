package api

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestBuildMultipartCompletionPartsNormalizesAndSorts(t *testing.T) {
	completed, uploadErr := buildMultipartCompletionParts([]models.UploadMultipartCompletePart{
		{Number: 2, ETag: `etag-2`},
		{Number: 1, ETag: `"etag-1"`},
	})
	if uploadErr != nil {
		t.Fatalf("expected success, got %+v", uploadErr)
	}
	if got := len(completed); got != 2 {
		t.Fatalf("expected 2 parts, got %d", got)
	}
	if *completed[0].PartNumber != 1 || *completed[1].PartNumber != 2 {
		t.Fatalf("expected sorted part numbers, got %d and %d", *completed[0].PartNumber, *completed[1].PartNumber)
	}
	if *completed[0].ETag != `"etag-1"` || *completed[1].ETag != `"etag-2"` {
		t.Fatalf("expected quoted etags, got %q and %q", *completed[0].ETag, *completed[1].ETag)
	}
}

func TestBuildMultipartCompletionPartsRejectsInvalidParts(t *testing.T) {
	_, uploadErr := buildMultipartCompletionParts([]models.UploadMultipartCompletePart{
		{Number: 0, ETag: "etag-1"},
	})
	if uploadErr == nil || uploadErr.message != "invalid part number" {
		t.Fatalf("expected invalid part number error, got %+v", uploadErr)
	}

	_, uploadErr = buildMultipartCompletionParts([]models.UploadMultipartCompletePart{
		{Number: 1, ETag: "   "},
	})
	if uploadErr == nil || uploadErr.message != "etag is required" {
		t.Fatalf("expected missing etag error, got %+v", uploadErr)
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
