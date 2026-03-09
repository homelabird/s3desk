package api

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func writeFakeThumbnailRclone(t *testing.T, mimeType string, size int64) string {
	t.Helper()
	return writeFakeRclone(t, ""+
		"cmd=''\n"+
		"want_stat=0\n"+
		"want_hash=0\n"+
		"for arg in \"$@\"; do\n"+
		"  if [ \"$arg\" = \"lsjson\" ]; then cmd='lsjson'; fi\n"+
		"  if [ \"$arg\" = \"--stat\" ]; then want_stat=1; fi\n"+
		"  if [ \"$arg\" = \"--hash\" ]; then want_hash=1; fi\n"+
		"  if [ \"$arg\" = \"cat\" ]; then cmd='cat'; fi\n"+
		"done\n"+
		"if [ \"$cmd\" = \"lsjson\" ] && [ \"$want_stat\" = \"1\" ] && [ \"$want_hash\" = \"1\" ]; then\n"+
		"  printf '{\"Path\":\"clip.mp4\",\"Name\":\"clip.mp4\",\"Size\":"+fmt.Sprintf("%d", size)+",\"ModTime\":\"2024-01-01T00:00:00Z\",\"MimeType\":\""+mimeType+"\",\"Hashes\":{\"ETag\":\"clip-etag\"}}\\n'\n"+
		"  exit 0\n"+
		"fi\n"+
		"if [ \"$cmd\" = \"cat\" ]; then\n"+
		"  cat >/dev/null\n"+
		"  printf 'fake-video-stream'\n"+
		"  exit 0\n"+
		"fi\n"+
		"printf 'unexpected rclone args: %s\\n' \"$*\" >&2\n"+
		"exit 1\n")
}

func writeFakeFFmpegJPEG(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	framePath := filepath.Join(dir, "frame.jpg")

	img := image.NewRGBA(image.Rect(0, 0, 8, 6))
	for y := 0; y < 6; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{R: uint8(20 * x), G: uint8(30 * y), B: 180, A: 255})
		}
	}

	f, err := os.Create(framePath)
	if err != nil {
		t.Fatalf("create frame: %v", err)
	}
	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 90}); err != nil {
		_ = f.Close()
		t.Fatalf("encode frame: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close frame: %v", err)
	}

	scriptPath := filepath.Join(dir, "ffmpeg")
	content := "#!/bin/sh\n" +
		"cat >/dev/null\n" +
		"cat " + "'" + framePath + "'" + "\n"
	if err := os.WriteFile(scriptPath, []byte(content), 0o700); err != nil {
		t.Fatalf("write fake ffmpeg: %v", err)
	}
	return scriptPath
}

func writeFakeFFmpegJPEGAfterBytes(t *testing.T, bytesToRead int) string {
	t.Helper()
	dir := t.TempDir()
	framePath := filepath.Join(dir, "frame.jpg")

	img := image.NewRGBA(image.Rect(0, 0, 8, 6))
	for y := 0; y < 6; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{R: uint8(20 * x), G: uint8(30 * y), B: 180, A: 255})
		}
	}

	f, err := os.Create(framePath)
	if err != nil {
		t.Fatalf("create frame: %v", err)
	}
	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 90}); err != nil {
		_ = f.Close()
		t.Fatalf("encode frame: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close frame: %v", err)
	}

	scriptPath := filepath.Join(dir, "ffmpeg")
	content := fmt.Sprintf("#!/bin/sh\n"+
		"dd bs=1 count=%d of=/dev/null 2>/dev/null || true\n"+
		"cat '%s'\n", bytesToRead, framePath)
	if err := os.WriteFile(scriptPath, []byte(content), 0o700); err != nil {
		t.Fatalf("write fake ffmpeg: %v", err)
	}
	return scriptPath
}

func writeFakeThumbnailRcloneStreaming(t *testing.T, mimeType string, size int64) string {
	t.Helper()
	return writeFakeRclone(t, ""+
		"cmd=''\n"+
		"want_stat=0\n"+
		"want_hash=0\n"+
		"for arg in \"$@\"; do\n"+
		"  if [ \"$arg\" = \"lsjson\" ]; then cmd='lsjson'; fi\n"+
		"  if [ \"$arg\" = \"--stat\" ]; then want_stat=1; fi\n"+
		"  if [ \"$arg\" = \"--hash\" ]; then want_hash=1; fi\n"+
		"  if [ \"$arg\" = \"cat\" ]; then cmd='cat'; fi\n"+
		"done\n"+
		"if [ \"$cmd\" = \"lsjson\" ] && [ \"$want_stat\" = \"1\" ] && [ \"$want_hash\" = \"1\" ]; then\n"+
		"  printf '{\"Path\":\"clip.mp4\",\"Name\":\"clip.mp4\",\"Size\":"+fmt.Sprintf("%d", size)+",\"ModTime\":\"2024-01-01T00:00:00Z\",\"MimeType\":\""+mimeType+"\",\"Hashes\":{\"ETag\":\"clip-etag\"}}\\n'\n"+
		"  exit 0\n"+
		"fi\n"+
		"if [ \"$cmd\" = \"cat\" ]; then\n"+
		"  trap 'exit 0' TERM INT\n"+
		"  printf 'fake-video-stream'\n"+
		"  while :; do sleep 1; done\n"+
		"fi\n"+
		"printf 'unexpected rclone args: %s\\n' \"$*\" >&2\n"+
		"exit 1\n")
}

func TestHandleGetObjectThumbnail_ReturnsJPEGForVideoMP4(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake ffmpeg/rclone use shell scripts")
	}

	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeThumbnailRclone(t, "video/mp4", 2048))
	t.Setenv("FFMPEG_PATH", writeFakeFFmpegJPEG(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/test-bucket/objects/thumbnail?key=clip.mp4&size=96", profile.ID, nil)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	if got := res.Header.Get("Content-Type"); got != "image/jpeg" {
		t.Fatalf("content-type=%q, want image/jpeg", got)
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if _, err := jpeg.Decode(bytes.NewReader(body)); err != nil {
		t.Fatalf("decode jpeg: %v", err)
	}
}

func TestHandleGetObjectThumbnail_AllowsVideoBeyondImageLimit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake ffmpeg/rclone use shell scripts")
	}

	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeThumbnailRclone(t, "video/mp4", 52_386_776))
	t.Setenv("FFMPEG_PATH", writeFakeFFmpegJPEG(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/test-bucket/objects/thumbnail?key=clip.mp4&size=24", profile.ID, nil)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
}

func TestHandleGetObjectThumbnail_StopsVideoStreamAfterFrameExtraction(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake ffmpeg/rclone use shell scripts")
	}

	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeThumbnailRcloneStreaming(t, "video/mp4", 52_386_776))
	t.Setenv("FFMPEG_PATH", writeFakeFFmpegJPEGAfterBytes(t, 4))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/buckets/test-bucket/objects/thumbnail?key=clip.mp4&size=24", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("X-Profile-Id", profile.ID)

	client := &http.Client{Timeout: time.Second}
	start := time.Now()
	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("request thumbnail: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	if elapsed := time.Since(start); elapsed > 900*time.Millisecond {
		t.Fatalf("thumbnail request took too long: %s", elapsed)
	}
}

func TestThumbnailCachePath_ChangesWhenFingerprintChanges(t *testing.T) {
	t.Parallel()

	pathA := thumbnailCachePath("/tmp/data", "profile-a", "bucket-a", "clip.mp4", 96, "v2:size=10|etag=a")
	pathB := thumbnailCachePath("/tmp/data", "profile-a", "bucket-a", "clip.mp4", 96, "v2:size=10|etag=b")
	if pathA == pathB {
		t.Fatalf("expected cache path to change when fingerprint changes")
	}
}

func TestThumbnailMaxBytesForKind(t *testing.T) {
	t.Parallel()

	if got, want := thumbnailMaxBytesForKind("image"), int64(thumbnailImageMaxBytes); got != want {
		t.Fatalf("image max bytes=%d want=%d", got, want)
	}
	if got, want := thumbnailMaxBytesForKind("video"), int64(thumbnailVideoMaxBytes); got != want {
		t.Fatalf("video max bytes=%d want=%d", got, want)
	}
	if thumbnailMaxBytesForKind("video") <= thumbnailMaxBytesForKind("image") {
		t.Fatal("expected video thumbnail limit to be larger than image limit")
	}
}
