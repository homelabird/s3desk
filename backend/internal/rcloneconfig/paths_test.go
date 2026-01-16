package rcloneconfig

import "testing"

func TestNormalizePathInput(t *testing.T) {
	if got := NormalizePathInput(" /a/b ", false); got != "a/b" {
		t.Fatalf("expected 'a/b', got %q", got)
	}
	if got := NormalizePathInput("/a/b", true); got != "/a/b" {
		t.Fatalf("expected '/a/b', got %q", got)
	}
}

func TestRemoteDirAddsTrailingSlash(t *testing.T) {
	got := RemoteDir("mybucket", "foo", false)
	want := "remote:mybucket/foo/"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}

	got = RemoteDir("mybucket", "foo/", false)
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}

	got = RemoteDir("mybucket", "", false)
	want = "remote:mybucket"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
