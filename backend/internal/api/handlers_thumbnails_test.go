package api

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"s3desk/internal/models"
)

func TestThumbnailLargeTailIndexedMP4WithRealFFmpeg(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is required for real MP4 decoding")
	}
	lockTestEnv(t)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	path := filepath.Join(t.TempDir(), "large.mp4")
	cmd := exec.CommandContext(ctx, ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-t", "3", "-c:v", "mpeg4", "-q:v", "2", path)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("generate MP4: %v: %s", err, out)
	}
	video, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	moov := bytes.LastIndex(video, []byte("moov")) - 4
	if moov < 0 || moov <= bytes.Index(video, []byte("mdat")) {
		t.Fatal("expected tail moov")
	}
	const size int64 = 768531432
	padding := size - int64(len(video))
	f, err := os.OpenFile(path, os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	// Insert a sparse free atom before moov; mdat offsets remain unchanged.
	header := make([]byte, 8)
	binary.BigEndian.PutUint32(header, uint32(padding))
	copy(header[4:], "free")
	if _, err := f.WriteAt(header, int64(moov)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteAt(video[moov:], int64(moov)+padding); err != nil {
		t.Fatal(err)
	}
	var offsets []int64
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		resolveFFmpegPath: func() (string, error) { return ffmpeg, nil },
		startRclone: func(_ *server, _ context.Context, _ models.ProfileSecrets, args []string, _ string) (*rcloneProcess, error) {
			var reader io.Reader
			if args[0] == "lsjson" {
				reader = bytes.NewBufferString(fmt.Sprintf(`{"Size":%d,"MimeType":"video/mp4","IsDir":false}`, size))
			} else if args[0] == "cat" {
				offset, count := int64(0), size
				for i := 1; i+1 < len(args); i++ {
					if args[i] == "--offset" || args[i] == "--count" {
						value, err := strconv.ParseInt(args[i+1], 10, 64)
						if err != nil {
							return nil, err
						}
						if args[i] == "--offset" {
							offset = value
						} else {
							count = value
						}
					}
				}
				if offset < 0 || count <= 0 || offset+count > size {
					return nil, fmt.Errorf("invalid range %d:%d", offset, count)
				}
				offsets = append(offsets, offset)
				reader = io.NewSectionReader(f, offset, count)
			} else {
				return nil, fmt.Errorf("unexpected args: %v", args)
			}
			return &rcloneProcess{stdout: io.NopCloser(reader), stderr: &bytes.Buffer{}, wait: func() error { return nil }}, nil
		},
	})
	defer restore()
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	for _, pixels := range []int{48, 360} {
		res := doJSONRequestWithProfile(t, srv, http.MethodGet, fmt.Sprintf("/api/v1/buckets/test-bucket/objects/thumbnail?key=large%%2Btest.mp4&size=%d", pixels), profile.ID, nil)
		body, err := io.ReadAll(res.Body)
		res.Body.Close()
		if err != nil || res.StatusCode != http.StatusOK {
			t.Fatalf("pixels=%d status=%d err=%v body=%s", pixels, res.StatusCode, err, body)
		}
		if _, err := jpeg.Decode(bytes.NewReader(body)); err != nil {
			t.Fatal(err)
		}
	}
	tailRead := false
	for _, offset := range offsets {
		if offset > 0 {
			tailRead = true
		}
	}
	if !tailRead {
		t.Fatal("test did not exercise tail range retrieval")
	}
}

func TestThumbnailTailIndexedMP4WithRealFFmpeg(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is required for real MP4 decoding")
	}
	lockTestEnv(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	path := filepath.Join(t.TempDir(), "clip.mp4")
	cmd := exec.CommandContext(ctx, ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-t", "3", "-c:v", "mpeg4", "-q:v", "2", path)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("generate MP4: %v: %s", err, out)
	}
	video, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.LastIndex(video, []byte("moov")) <= bytes.Index(video, []byte("mdat")) {
		t.Fatal("fixture must have its MP4 index after media data")
	}
	installThumbnailProcessHooks(t, "video/mp4", int64(len(video)), func() io.ReadCloser {
		return io.NopCloser(bytes.NewReader(video))
	}, nil)
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	for _, size := range []int{48, 360} {
		res := doJSONRequestWithProfile(t, srv, http.MethodGet, fmt.Sprintf("/api/v1/buckets/test-bucket/objects/thumbnail?key=clip%%2Btest.mp4&size=%d", size), profile.ID, nil)
		body, err := io.ReadAll(res.Body)
		res.Body.Close()
		if err != nil || res.StatusCode != http.StatusOK {
			t.Fatalf("size=%d status=%d error=%v body=%s", size, res.StatusCode, err, body)
		}
		if _, err := jpeg.Decode(bytes.NewReader(body)); err != nil {
			t.Fatalf("size=%d invalid JPEG: %v", size, err)
		}
	}
}

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
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		startRclone: func(_ *server, _ context.Context, _ models.ProfileSecrets, args []string, _ string) (*rcloneProcess, error) {
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
		},
		resolveFFmpegPath:    func() (string, error) { return "ffmpeg", nil },
		decodeThumbnailVideo: decode,
	})
	t.Cleanup(restore)
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

func TestThumbnailDecodeFailureHasDistinctCode(t *testing.T) {
	lockTestEnv(t)
	installThumbnailProcessHooks(t, "video/mp4", 128, func() io.ReadCloser {
		return io.NopCloser(bytes.NewReader(make([]byte, 128)))
	}, func(context.Context, string, io.Reader) (image.Image, error) {
		return nil, fmt.Errorf("invalid video fixture")
	})
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/test-bucket/objects/thumbnail?key=bad.mp4", profile.ID, nil)
	defer res.Body.Close()
	var response models.ErrorResponse
	decodeJSONResponse(t, res, &response)
	if res.StatusCode != http.StatusUnsupportedMediaType || response.Error.Code != "thumbnail_decode_failed" {
		t.Fatalf("status=%d code=%s", res.StatusCode, response.Error.Code)
	}
}
