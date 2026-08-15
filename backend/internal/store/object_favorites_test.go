package store

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	return newTestStoreAt(t, filepath.Join(t.TempDir(), "s3desk.db"))
}

func newTestStoreAt(t *testing.T, sqlitePath string) *Store {
	t.Helper()
	gormDB, err := db.Open(db.Config{
		Backend:    db.BackendSQLite,
		SQLitePath: sqlitePath,
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("open sql db: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	st, err := New(gormDB, Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return st
}

func createTestProfile(t testing.TB, st *Store) models.Profile {
	t.Helper()
	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := false

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		ForcePathStyle:        &forcePathStyle,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	return profile
}

func TestAddObjectFavoriteReturnsCreatedAt(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	fav, err := st.AddObjectFavorite(ctx, profile.ID, "mybucket", "path/to/file.txt")
	if err != nil {
		t.Fatalf("add favorite: %v", err)
	}
	if fav.Key != "path/to/file.txt" {
		t.Fatalf("expected key %q, got %q", "path/to/file.txt", fav.Key)
	}
	if fav.CreatedAt == "" {
		t.Fatal("expected non-empty createdAt")
	}
}

func TestAddObjectFavoriteDuplicatePreservesCreatedAt(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	first, err := st.AddObjectFavorite(ctx, profile.ID, "mybucket", "dup.txt")
	if err != nil {
		t.Fatalf("add favorite: %v", err)
	}

	second, err := st.AddObjectFavorite(ctx, profile.ID, "mybucket", "dup.txt")
	if err != nil {
		t.Fatalf("add duplicate favorite: %v", err)
	}

	if second.CreatedAt != first.CreatedAt {
		t.Fatalf("duplicate should preserve original createdAt: first=%q second=%q", first.CreatedAt, second.CreatedAt)
	}
}

func TestDeleteObjectFavorite(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	_, err := st.AddObjectFavorite(ctx, profile.ID, "mybucket", "del.txt")
	if err != nil {
		t.Fatalf("add favorite: %v", err)
	}

	deleted, err := st.DeleteObjectFavorite(ctx, profile.ID, "mybucket", "del.txt")
	if err != nil {
		t.Fatalf("delete favorite: %v", err)
	}
	if !deleted {
		t.Fatal("expected deletion to return true")
	}

	deletedAgain, err := st.DeleteObjectFavorite(ctx, profile.ID, "mybucket", "del.txt")
	if err != nil {
		t.Fatalf("delete nonexistent favorite: %v", err)
	}
	if deletedAgain {
		t.Fatal("deleting nonexistent favorite should return false")
	}
}

func TestListObjectFavorites(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	_, err := st.AddObjectFavorite(ctx, profile.ID, "mybucket", "a.txt")
	if err != nil {
		t.Fatalf("add favorite a: %v", err)
	}
	_, err = st.AddObjectFavorite(ctx, profile.ID, "mybucket", "b.txt")
	if err != nil {
		t.Fatalf("add favorite b: %v", err)
	}

	favs, nextCursor, err := st.ListObjectFavorites(ctx, profile.ID, "mybucket", ObjectFavoritesFilter{})
	if err != nil {
		t.Fatalf("list favorites: %v", err)
	}
	if nextCursor != nil {
		t.Fatalf("unexpected next cursor: %q", *nextCursor)
	}
	if len(favs) != 2 {
		t.Fatalf("expected 2 favorites, got %d", len(favs))
	}
}

func TestListObjectFavoritesFiltersAndPaginates(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	for _, key := range []string{"docs/a.txt", "images/a.png", "docs/b.txt"} {
		if _, err := st.AddObjectFavorite(ctx, profile.ID, "mybucket", key); err != nil {
			t.Fatalf("add favorite %q: %v", key, err)
		}
	}

	first, cursor, err := st.ListObjectFavorites(ctx, profile.ID, "mybucket", ObjectFavoritesFilter{Prefix: "docs/", Limit: 1})
	if err != nil {
		t.Fatalf("list first page: %v", err)
	}
	if len(first) != 1 || cursor == nil {
		t.Fatalf("first page=%v cursor=%v, want one item and cursor", first, cursor)
	}
	second, next, err := st.ListObjectFavorites(ctx, profile.ID, "mybucket", ObjectFavoritesFilter{Prefix: "docs/", Limit: 1, Cursor: *cursor})
	if err != nil {
		t.Fatalf("list second page: %v", err)
	}
	if len(second) != 1 || next != nil {
		t.Fatalf("second page=%v next=%v, want one final item", second, next)
	}
	if first[0].Key == second[0].Key || !strings.HasPrefix(first[0].Key, "docs/") || !strings.HasPrefix(second[0].Key, "docs/") {
		t.Fatalf("unexpected paginated keys: %q, %q", first[0].Key, second[0].Key)
	}

	if _, _, err := st.ListObjectFavorites(ctx, profile.ID, "mybucket", ObjectFavoritesFilter{Cursor: "invalid"}); !errors.Is(err, ErrInvalidObjectFavoriteCursor) {
		t.Fatalf("invalid cursor error=%v", err)
	}
}
