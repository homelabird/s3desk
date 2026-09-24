package objectlisting

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func query() Query { return Query{ProfileID: "profile", Bucket: "bucket", Delimiter: "/", MaxKeys: 2} }
func TestProviderCursorResumesWithoutReplaying(t *testing.T) {
	q := query()
	calls := 0
	fetch := func(ctx context.Context, r Request) (Page, error) {
		calls++
		if calls == 1 {
			if r.ContinuationToken != "" {
				t.Fatal(r)
			}
			return Page{Items: []models.ObjectItem{{Key: "a"}, {Key: "b"}}, IsTruncated: true, NextToken: "opaque/+==cursor"}, nil
		}
		if r.ContinuationToken != "opaque/+==cursor" {
			t.Fatalf("cursor not forwarded: %q", r.ContinuationToken)
		}
		return Page{Items: []models.ObjectItem{{Key: "c"}}}, nil
	}
	first, err := List(context.Background(), q, fetch)
	if err != nil {
		t.Fatal(err)
	}
	if !first.IsTruncated || first.NextContinuationToken == nil {
		t.Fatal("missing cursor")
	}
	q.Token = *first.NextContinuationToken
	second, err := List(context.Background(), q, fetch)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || len(second.Items) != 1 || second.Items[0].Key != "c" || second.IsTruncated {
		t.Fatalf("bad resume: %+v; calls=%d", second, calls)
	}
}
func TestTokenScopeAndMalformedTokensRejectedBeforeIO(t *testing.T) {
	q := query()
	token, _ := encodeToken(q, "next")
	variants := []Query{q, q, q, q, q}
	variants[0].ProfileID = "other"
	variants[1].Bucket = "other"
	variants[2].Prefix = "other/"
	variants[3].Delimiter = ""
	variants[4].PrefixesOnly = true
	for _, other := range variants {
		other.Token = token
		_, err := List(context.Background(), other, func(context.Context, Request) (Page, error) {
			t.Fatal("mismatched token reached provider")
			return Page{}, nil
		})
		if !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err=%v", err)
		}
	}
	for _, bad := range []string{"bad", TokenPrefix + "!", TokenPrefix + strings.Repeat("x", maxTokenBytes)} {
		q.Token = bad
		if _, err := decodeToken(q); !errors.Is(err, ErrInvalidToken) {
			t.Fatal(err)
		}
	}
	q.Token = token
	q.MaxKeys = 1
	if _, err := decodeToken(q); err != nil {
		t.Fatal("changing page size should be allowed")
	}
}

func TestProviderTokenPrefixesAndScopesAreIsolated(t *testing.T) {
	gcs := query()
	gcs.Provider = "gcs"
	gcs.TokenPrefix = GCSTokenPrefix
	awsToken, err := encodeToken(query(), "aws-next")
	if err != nil {
		t.Fatal(err)
	}
	gcsToken, err := encodeToken(gcs, "gcs-next")
	if err != nil || !strings.HasPrefix(gcsToken, GCSTokenPrefix) {
		t.Fatalf("token=%q err=%v", gcsToken, err)
	}
	azure := query()
	azure.Provider = "azure"
	azure.TokenPrefix = AzureTokenPrefix
	azureToken, err := encodeToken(azure, "azure-next")
	if err != nil || !strings.HasPrefix(azureToken, AzureTokenPrefix) {
		t.Fatalf("token=%q err=%v", azureToken, err)
	}
	oci := query()
	oci.Provider = "oci"
	oci.TokenPrefix = OCITokenPrefix
	ociToken, err := encodeToken(oci, "oci-next")
	if err != nil || !strings.HasPrefix(ociToken, OCITokenPrefix) {
		t.Fatalf("token=%q err=%v", ociToken, err)
	}
	for _, tc := range []struct {
		q     Query
		token string
	}{{gcs, awsToken}, {query(), gcsToken}, {azure, gcsToken}, {azure, awsToken}, {oci, azureToken}, {oci, awsToken}} {
		tc.q.Token = tc.token
		if _, err := List(context.Background(), tc.q, func(context.Context, Request) (Page, error) {
			t.Fatal("provider-mismatched token reached fetcher")
			return Page{}, nil
		}); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err=%v", err)
		}
	}
}
func TestPrefixFilteringAndFolderMarkers(t *testing.T) {
	q := query()
	q.Prefix = "docs/"
	q.PrefixesOnly = true
	q.MaxKeys = 5
	out, err := List(context.Background(), q, func(context.Context, Request) (Page, error) {
		return Page{CommonPrefixes: []string{"docs/sub/"}, Items: []models.ObjectItem{{Key: "docs/", Size: 0}, {Key: "docs/empty/", Size: 0}, {Key: "docs/file", Size: 10}, {Key: "docs/data/", Size: 12}}}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 0 || len(out.CommonPrefixes) != 2 || out.CommonPrefixes[1] != "docs/empty/" {
		t.Fatalf("bad folders: %+v", out)
	}
}
func TestBoundedEmptyPrefixPagesReturnResumableCursor(t *testing.T) {
	q := query()
	q.PrefixesOnly = true
	calls := 0
	fetch := func(ctx context.Context, r Request) (Page, error) {
		calls++
		return Page{Items: []models.ObjectItem{{Key: fmt.Sprint(calls)}}, IsTruncated: true, NextToken: fmt.Sprint(calls)}, nil
	}
	out, err := List(context.Background(), q, fetch)
	if err != nil {
		t.Fatal(err)
	}
	if calls != MaxPagesPerRequest || !out.IsTruncated || out.NextContinuationToken == nil || len(out.CommonPrefixes) != 0 {
		t.Fatalf("unbounded/incorrect scan: calls=%d %+v", calls, out)
	}
	q.Token = *out.NextContinuationToken
	next, err := decodeToken(q)
	if err != nil || next != strconv.Itoa(MaxPagesPerRequest) {
		t.Fatalf("lost progress: %s %v", next, err)
	}
}
func TestPrefixFilteringFillsFromNextPageWithoutReplaying(t *testing.T) {
	q := query()
	q.MaxKeys = 1
	q.PrefixesOnly = true
	calls := 0
	out, err := List(context.Background(), q, func(ctx context.Context, r Request) (Page, error) {
		calls++
		if calls == 1 {
			return Page{Items: []models.ObjectItem{{Key: "file"}}, IsTruncated: true, NextToken: "after-file"}, nil
		}
		if r.ContinuationToken != "after-file" {
			t.Fatal(r)
		}
		return Page{CommonPrefixes: []string{"folder/"}}, nil
	})
	if err != nil || calls != 2 || len(out.CommonPrefixes) != 1 || out.IsTruncated {
		t.Fatalf("out=%+v calls=%d err=%v", out, calls, err)
	}
}
func TestBrokenPaginationFailsInsteadOfLoopingOrDroppingObjects(t *testing.T) {
	for _, page := range []Page{{IsTruncated: true}, {Items: []models.ObjectItem{{Key: "1"}, {Key: "2"}, {Key: "3"}}}} {
		if _, err := List(context.Background(), query(), func(context.Context, Request) (Page, error) { return page, nil }); !errors.Is(err, ErrInvalidPage) {
			t.Fatal(err)
		}
	}
	q := query()
	q.PrefixesOnly = true
	if _, err := List(context.Background(), q, func(context.Context, Request) (Page, error) { return Page{IsTruncated: true, NextToken: "repeat"}, nil }); !errors.Is(err, ErrInvalidPage) {
		t.Fatal(err)
	}
}
func TestCancellationAndUpstreamErrorsPropagate(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := List(ctx, query(), func(context.Context, Request) (Page, error) {
		t.Fatal("canceled query performed IO")
		return Page{}, nil
	}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	failure := errors.New("provider unavailable")
	if _, err := List(context.Background(), query(), func(context.Context, Request) (Page, error) { return Page{}, failure }); !errors.Is(err, failure) {
		t.Fatal(err)
	}
}
func TestExactLastPageAndEmptyBucketAreNotTruncated(t *testing.T) {
	for _, items := range [][]models.ObjectItem{nil, {{Key: "a"}, {Key: "b"}}} {
		out, err := List(context.Background(), query(), func(context.Context, Request) (Page, error) { return Page{Items: items}, nil })
		if err != nil || out.IsTruncated || out.NextContinuationToken != nil || out.Items == nil || out.CommonPrefixes == nil {
			t.Fatalf("out=%+v err=%v", out, err)
		}
	}
}
func TestURLDecodingPreservesPlusPercentUnicodeAndControlCharacters(t *testing.T) {
	cases := []struct {
		raw     string
		encoded bool
		want    string
	}{{"a+b%20c", true, "a+b c"}, {"100%25", true, "100%"}, {"%252F", true, "%2F"}, {"한글%2F파일", true, "한글/파일"}, {"a%01b", true, "a\x01b"}, {"100%", false, "100%"}}
	for _, c := range cases {
		got, err := DecodeKey(c.raw, c.encoded)
		if err != nil || got != c.want {
			t.Fatalf("got=%q want=%q err=%v", got, c.want, err)
		}
	}
	if _, err := DecodeKey("bad%", true); err == nil {
		t.Fatal("invalid escape accepted")
	}
}
func TestOneHundredPagesVisitEachObjectOnce(t *testing.T) {
	const pages = 100
	const size = 100
	q := query()
	q.MaxKeys = size
	calls, objects := 0, 0
	for page := 0; page < pages; page++ {
		out, err := List(context.Background(), q, func(ctx context.Context, r Request) (Page, error) {
			calls++
			offset := 0
			if r.ContinuationToken != "" {
				offset, _ = strconv.Atoi(r.ContinuationToken)
			}
			p := Page{}
			for i := 0; i < r.MaxKeys; i++ {
				p.Items = append(p.Items, models.ObjectItem{Key: fmt.Sprintf("key-%06d", offset+i)})
			}
			objects += len(p.Items)
			p.IsTruncated = offset+size < pages*size
			if p.IsTruncated {
				p.NextToken = strconv.Itoa(offset + size)
			}
			return p, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		if out.NextContinuationToken != nil {
			q.Token = *out.NextContinuationToken
		}
	}
	if calls != pages || objects != pages*size {
		t.Fatalf("replayed objects: requests=%d objects=%d", calls, objects)
	}
	t.Logf("native: %d provider pages / %d entries; legacy replay model: %d entries", calls, objects, size*pages*(pages+1)/2)
}
