package api

import (
	"reflect"
	"testing"

	"s3desk/internal/store"
)

func TestBuildUploadVerificationTargetsFromTracked(t *testing.T) {
	sizeA := int64(11)
	sizeB := int64(22)
	targets := buildUploadVerificationTargetsFromTracked([]store.UploadObject{
		{Path: "a.txt", Bucket: "demo", ObjectKey: "prefix/a.txt", ExpectedSize: &sizeA},
		{Path: "", Bucket: "demo", ObjectKey: "prefix/skip.txt", ExpectedSize: &sizeB},
		{Path: "b.txt", Bucket: "demo", ObjectKey: "prefix/b.txt", ExpectedSize: &sizeB},
	})

	want := []uploadVerificationTarget{
		{Path: "a.txt", Bucket: "demo", Key: "prefix/a.txt", ExpectedSize: &sizeA},
		{Path: "b.txt", Bucket: "demo", Key: "prefix/b.txt", ExpectedSize: &sizeB},
	}
	if !reflect.DeepEqual(targets, want) {
		t.Fatalf("targets=%#v, want %#v", targets, want)
	}
}

func TestBuildUploadVerificationTargetsFromMultipart(t *testing.T) {
	targets := buildUploadVerificationTargetsFromMultipart([]store.MultipartUpload{
		{Path: "a.txt", Bucket: "demo", ObjectKey: "prefix/a.txt", FileSize: 11},
		{Path: "", Bucket: "demo", ObjectKey: "prefix/skip.txt", FileSize: 22},
		{Path: "b.txt", Bucket: "demo", ObjectKey: "prefix/b.txt", FileSize: 33},
	})

	if len(targets) != 2 {
		t.Fatalf("len(targets)=%d, want 2", len(targets))
	}
	if got := *targets[0].ExpectedSize; got != 11 {
		t.Fatalf("targets[0].ExpectedSize=%d, want 11", got)
	}
	if got := *targets[1].ExpectedSize; got != 33 {
		t.Fatalf("targets[1].ExpectedSize=%d, want 33", got)
	}
}

func TestBuildUploadVerificationTargetsFromRequest(t *testing.T) {
	size := int64(7)
	targets := buildUploadVerificationTargetsFromRequest(store.UploadSession{
		Bucket: "demo",
		Prefix: "nested",
	}, uploadCommitRequest{
		Items: []uploadCommitItem{
			{Path: "folder/file.txt", Size: &size},
			{Path: "../skip.txt"},
			{Path: "plain.txt"},
		},
	})

	want := []uploadVerificationTarget{
		{Path: "folder/file.txt", Bucket: "demo", Key: "nested/folder/file.txt", ExpectedSize: &size},
		{Path: "plain.txt", Bucket: "demo", Key: "nested/plain.txt", ExpectedSize: nil},
	}
	if !reflect.DeepEqual(targets, want) {
		t.Fatalf("targets=%#v, want %#v", targets, want)
	}
}

func TestMergeUploadVerificationTargets(t *testing.T) {
	size := int64(11)
	merged := mergeUploadVerificationTargets(
		[]uploadVerificationTarget{
			{Path: "a.txt", Key: "prefix/a.txt", ExpectedSize: &size},
			{Path: "", Key: "prefix/fallback.txt"},
		},
		[]uploadVerificationTarget{
			{Path: "a.txt", Key: "prefix/a-duplicate.txt"},
			{Path: "", Key: "prefix/fallback.txt"},
			{Path: "b.txt", Key: "prefix/b.txt"},
		},
	)

	want := []uploadVerificationTarget{
		{Path: "a.txt", Key: "prefix/a.txt", ExpectedSize: &size},
		{Path: "", Key: "prefix/fallback.txt"},
		{Path: "b.txt", Key: "prefix/b.txt"},
	}
	if !reflect.DeepEqual(merged, want) {
		t.Fatalf("merged=%#v, want %#v", merged, want)
	}
}
