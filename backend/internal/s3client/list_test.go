package s3client

import (
	"context"
	"math"
	"s3desk/internal/objectlisting"
	"testing"
)

func TestListPageRejectsInvalidLimitBeforeRequest(t *testing.T) {
	for _, limit := range []int{-1, 0, 1001, math.MaxInt} {
		if _, err := ListPage(nil)(context.Background(), objectlisting.Request{MaxKeys: limit}); err == nil {
			t.Fatalf("limit %d accepted", limit)
		}
	}
}
