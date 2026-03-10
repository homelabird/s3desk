package api

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"testing"
	"time"

	"s3desk/internal/models"
)

type blockingAfterPrefixReader struct {
	prefix []byte
}

func (r *blockingAfterPrefixReader) Read(p []byte) (int, error) {
	if len(r.prefix) > 0 {
		n := copy(p, r.prefix)
		r.prefix = r.prefix[n:]
		return n, nil
	}
	select {}
}

func (r *blockingAfterPrefixReader) Close() error {
	return nil
}

func makeTestThumbnailImage() image.Image {
	img := image.NewRGBA(image.Rect(0, 0, 8, 6))
	for y := 0; y < 6; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{R: uint8(20 * x), G: uint8(30 * y), B: 180, A: 255})
		}
	}
	return img
}

func installThumbnailProcessHooks(
	t *testing.T,
	mimeType string,
	size int64,
	streamFactory func() io.ReadCloser,
	decode func(context.Context, string, io.Reader) (image.Image, error),
) {
	t.Helper()
	prevStart := startRcloneHook
	prevResolve := resolveFFmpegPathHook
	prevDecode := decodeThumbnailVideoHook

	startRcloneHook = func(_ *server, _ context.Context, _ models.ProfileSecrets, args []string, _ string) (*rcloneProcess, error) {
		if len(args) >= 3 && args[0] == "lsjson" && args[1] == "--stat" {
			entry := fmt.Sprintf(
				"{\"Path\":\"clip.mp4\",\"Name\":\"clip.mp4\",\"Size\":%d,\"ModTime\":\"2024-01-01T00:00:00Z\",\"MimeType\":\"%s\",\"Hashes\":{\"ETag\":\"clip-etag\"}}",
				size,
				mimeType,
			)
			return &rcloneProcess{
				stdout: io.NopCloser(bytes.NewBufferString(entry)),
				stderr: &bytes.Buffer{},
				wait:   func() error { return nil },
			}, nil
		}
		if len(args) >= 1 && args[0] == "cat" {
			return &rcloneProcess{
				stdout: streamFactory(),
				stderr: &bytes.Buffer{},
				wait:   func() error { return nil },
			}, nil
		}
		return nil, fmt.Errorf("unexpected rclone args: %v", args)
	}
	resolveFFmpegPathHook = func() (string, error) { return "ffmpeg", nil }
	decodeThumbnailVideoHook = decode

	t.Cleanup(func() {
		startRcloneHook = prevStart
		resolveFFmpegPathHook = prevResolve
		decodeThumbnailVideoHook = prevDecode
	})
}

func TestHandleGetObjectThumbnail_ReturnsJPEGForVideoMP4(t *testing.T) {
	lockTestEnv(t)
	installThumbnailProcessHooks(
		t,
		"video/mp4",
		2048,
		func() io.ReadCloser { return io.NopCloser(bytes.NewBufferString("fake-video-stream")) },
		func(_ context.Context, _ string, _ io.Reader) (image.Image, error) {
			return makeTestThumbnailImage(), nil
		},
	)

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

func TestHandleGetObjectThumbnail_ReturnsJPEGForVideoMKV(t *testing.T) {
	lockTestEnv(t)
	installThumbnailProcessHooks(
		t,
		"video/x-matroska",
		4096,
		func() io.ReadCloser { return io.NopCloser(bytes.NewBufferString("fake-video-stream")) },
		func(_ context.Context, _ string, _ io.Reader) (image.Image, error) {
			return makeTestThumbnailImage(), nil
		},
	)

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/test-bucket/objects/thumbnail?key=clip.mkv&size=96", profile.ID, nil)
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
	lockTestEnv(t)
	installThumbnailProcessHooks(
		t,
		"video/mp4",
		52_386_776,
		func() io.ReadCloser { return io.NopCloser(bytes.NewBufferString("fake-video-stream")) },
		func(_ context.Context, _ string, _ io.Reader) (image.Image, error) {
			return makeTestThumbnailImage(), nil
		},
	)

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
	lockTestEnv(t)
	installThumbnailProcessHooks(
		t,
		"video/mp4",
		52_386_776,
		func() io.ReadCloser {
			return &blockingAfterPrefixReader{prefix: []byte("fake")}
		},
		func(_ context.Context, _ string, r io.Reader) (image.Image, error) {
			buf := make([]byte, 4)
			if _, err := io.ReadFull(r, buf); err != nil {
				return nil, err
			}
			return makeTestThumbnailImage(), nil
		},
	)

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

func TestHandleGetObjectThumbnail_ServesRequestFingerprintCacheWithoutStat(t *testing.T) {
	t.Parallel()

	st, _, srv, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			img.Set(x, y, color.RGBA{R: 120, G: uint8(20 * x), B: uint8(20 * y), A: 255})
		}
	}
	cachePath, ok := thumbnailRequestFingerprintCachePath(dataDir, profile.ID, "test-bucket", "clip.png", 96, httptest.NewRequest(http.MethodGet, "/?key=clip.png&size=96&objectSize=10&etag=etag-a&lastModified=2024-01-01T00:00:00Z&contentType=image/png", nil))
	if !ok {
		t.Fatal("expected request fingerprint cache path")
	}
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o700); err != nil {
		t.Fatalf("mkdir cache dir: %v", err)
	}
	f, err := os.Create(cachePath)
	if err != nil {
		t.Fatalf("create cache file: %v", err)
	}
	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 85}); err != nil {
		_ = f.Close()
		t.Fatalf("encode jpeg: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close cache file: %v", err)
	}

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/test-bucket/objects/thumbnail?key=clip.png&size=96&objectSize=10&etag=etag-a&lastModified=2024-01-01T00:00:00Z&contentType=image/png", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	if got := res.Header.Get("Content-Type"); got != "image/jpeg" {
		t.Fatalf("content-type=%q, want image/jpeg", got)
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
	if got, want := thumbnailMaxBytesForKind("video"), int64(0); got != want {
		t.Fatalf("video max bytes=%d want=%d", got, want)
	}
	if thumbnailMaxBytesForKind("video") != 0 {
		t.Fatal("expected video thumbnails to use streaming fallbacks instead of a hard max-bytes cap")
	}
}
