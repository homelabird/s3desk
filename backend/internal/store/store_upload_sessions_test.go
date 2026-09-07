package store

import (
	"context"
	"testing"
)

func TestListExpiredUploadSessionsPagination(t *testing.T) {
	testListExpiredUploadSessionsPagination(t, newTestStore(t))
}

func testListExpiredUploadSessionsPagination(t *testing.T, st *Store) {
	ctx := context.Background()
	profile := createTestProfile(t, st)
	var sessions []UploadSession
	for _, expiresAt := range []string{
		"2000-01-01T00:00:00Z",
		"2000-01-01T00:00:00Z",
		"2000-01-02T00:00:00Z",
		"2000-01-03T00:00:00Z",
	} {
		session, err := st.CreateUploadSession(ctx, profile.ID, "bucket", "", "staging", "", expiresAt)
		if err != nil {
			t.Fatal(err)
		}
		sessions = append(sessions, session)
	}

	var after *UploadSession
	for _, expected := range sessions[:3] {
		page, err := st.ListExpiredUploadSessions(ctx, "2000-01-03T00:00:00Z", 1, after)
		if err != nil || len(page) != 1 || page[0].ID != expected.ID {
			t.Fatalf("page=%v err=%v, want session %s", page, err, expected.ID)
		}
		if _, err := st.DeleteUploadSession(ctx, profile.ID, page[0].ID); err != nil {
			t.Fatal(err)
		}
		after = &page[0]
	}
	page, err := st.ListExpiredUploadSessions(ctx, "2000-01-03T00:00:00Z", 1, after)
	if err != nil || len(page) != 0 {
		t.Fatalf("last page=%v err=%v, want no sessions at or after cutoff", page, err)
	}
}
