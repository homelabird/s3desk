package api

import (
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/store"
)

func TestBuildUploadCommitArtifactsSanitizesAndIndexesItems(t *testing.T) {
	totalFiles := 2
	totalBytes := int64(11)
	sized := int64(11)

	artifacts := buildUploadCommitArtifacts("upload-1", store.UploadSession{
		Bucket: "bucket-a",
		Prefix: "incoming",
	}, uploadCommitRequest{
		Label:      "  import  ",
		RootName:   "  docs  ",
		RootKind:   "folder",
		TotalFiles: &totalFiles,
		TotalBytes: &totalBytes,
		Items: []uploadCommitItem{
			{Path: "docs/readme.txt", Size: &sized},
			{Path: "../escape.txt", Size: &sized},
			{Path: "docs/notes.txt"},
		},
	})

	if artifacts.payload["label"] != "import" {
		t.Fatalf("expected trimmed label, got %#v", artifacts.payload["label"])
	}
	if artifacts.payload["rootName"] != "docs" {
		t.Fatalf("expected trimmed rootName, got %#v", artifacts.payload["rootName"])
	}
	if artifacts.payload["rootKind"] != "folder" {
		t.Fatalf("expected rootKind folder, got %#v", artifacts.payload["rootKind"])
	}

	items, ok := artifacts.payload["items"].([]map[string]any)
	if !ok {
		t.Fatalf("expected cleaned items payload")
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 cleaned items, got %d", len(items))
	}
	if items[0]["key"] != "incoming/docs/readme.txt" {
		t.Fatalf("expected prefixed key, got %#v", items[0]["key"])
	}
	if len(artifacts.indexEntries) != 1 {
		t.Fatalf("expected 1 indexed item, got %d", len(artifacts.indexEntries))
	}
	if artifacts.progress == nil || artifacts.progress.BytesTotal == nil || *artifacts.progress.BytesTotal != totalBytes {
		t.Fatalf("expected progress bytes total %d, got %+v", totalBytes, artifacts.progress)
	}
}

func TestBuildCompletedMultipartPartsRequiresSequentialParts(t *testing.T) {
	part1 := int32(1)
	part3 := int32(3)
	etag1 := "\"etag-1\""
	etag3 := "\"etag-3\""

	_, err := buildCompletedMultipartParts([]types.Part{
		{PartNumber: &part1, ETag: &etag1},
		{PartNumber: &part3, ETag: &etag3},
	}, 3)
	if !errors.Is(err, errUploadIncomplete) {
		t.Fatalf("expected errUploadIncomplete, got %v", err)
	}
}
