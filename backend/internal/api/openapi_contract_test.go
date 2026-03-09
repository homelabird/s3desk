package api

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"

	"s3desk/internal/config"
)

func TestOpenAPIContractRoutesStayInSync(t *testing.T) {
	t.Parallel()

	doc := loadOpenAPIDoc(t)
	handler := New(Dependencies{Config: config.Config{}})
	routes, ok := handler.(chi.Routes)
	if !ok {
		t.Fatalf("api.New returned %T; want chi.Routes", handler)
	}

	actual := map[string]struct{}{}
	if err := chi.Walk(routes, func(method string, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		key, keep := normalizeRuntimeRoute(method, route)
		if keep {
			actual[key] = struct{}{}
		}
		return nil
	}); err != nil {
		t.Fatalf("walk routes: %v", err)
	}

	documented := map[string]struct{}{}
	for path, item := range doc.Paths.Map() {
		for method := range item.Operations() {
			documented[strings.ToUpper(method)+" "+path] = struct{}{}
		}
	}

	undocumented := missingKeys(actual, documented)
	if len(undocumented) > 0 {
		t.Fatalf("runtime routes missing from OpenAPI:\n%s", strings.Join(undocumented, "\n"))
	}

	stale := missingKeys(documented, actual)
	if len(stale) > 0 {
		t.Fatalf("OpenAPI routes missing from runtime router:\n%s", strings.Join(stale, "\n"))
	}
}

func TestOpenAPIMetaAndMigrationSchemasCoverFrontendContract(t *testing.T) {
	t.Parallel()

	doc := loadOpenAPIDoc(t)

	metaSchemaRef := doc.Components.Schemas["MetaResponse"]
	if metaSchemaRef == nil || metaSchemaRef.Value == nil {
		t.Fatal("MetaResponse schema missing from OpenAPI")
	}
	metaSchema := metaSchemaRef.Value
	if _, ok := metaSchema.Properties["dbBackend"]; !ok {
		t.Fatal("MetaResponse.dbBackend missing from OpenAPI")
	}
	if !containsString(metaSchema.Required, "dbBackend") {
		t.Fatal("MetaResponse.dbBackend must be required in OpenAPI")
	}
	if !containsString(metaSchema.Required, "uploadDirectStream") {
		t.Fatal("MetaResponse.uploadDirectStream must be required in OpenAPI")
	}

	restorePath := doc.Paths.Find("/server/restore")
	if restorePath == nil || restorePath.Post == nil {
		t.Fatal("/server/restore POST missing from OpenAPI")
	}
	backupPath := doc.Paths.Find("/server/backup")
	if backupPath == nil || backupPath.Get == nil {
		t.Fatal("/server/backup GET missing from OpenAPI")
	}

	restoreSchemaRef := doc.Components.Schemas["ServerRestoreResponse"]
	if restoreSchemaRef == nil || restoreSchemaRef.Value == nil {
		t.Fatal("ServerRestoreResponse schema missing from OpenAPI")
	}
	manifestSchemaRef := doc.Components.Schemas["ServerMigrationManifest"]
	if manifestSchemaRef == nil || manifestSchemaRef.Value == nil {
		t.Fatal("ServerMigrationManifest schema missing from OpenAPI")
	}
}

func loadOpenAPIDoc(t *testing.T) *openapi3.T {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	specPath := filepath.Join(filepath.Dir(file), "..", "..", "..", "openapi.yml")

	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromFile(specPath)
	if err != nil {
		t.Fatalf("load OpenAPI spec: %v", err)
	}
	if err := doc.Validate(context.Background()); err != nil {
		t.Fatalf("validate OpenAPI spec: %v", err)
	}
	return doc
}

func normalizeRuntimeRoute(method string, route string) (string, bool) {
	if method == http.MethodOptions {
		return "", false
	}
	if route != "/" {
		route = strings.TrimSuffix(route, "/")
	}
	switch {
	case route == "/download-proxy":
		return method + " " + route, true
	case strings.HasPrefix(route, "/api/v1"):
		trimmed := strings.TrimPrefix(route, "/api/v1")
		if trimmed == "" {
			return "", false
		}
		return method + " " + trimmed, true
	default:
		return "", false
	}
}

func missingKeys(left map[string]struct{}, right map[string]struct{}) []string {
	out := make([]string, 0)
	for key := range left {
		if _, ok := right[key]; !ok {
			out = append(out, fmt.Sprintf("- %s", key))
		}
	}
	sort.Strings(out)
	return out
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}
