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
	metaCapabilitiesSchema := requireOpenAPISchema(t, doc, "MetaCapabilities")
	if _, ok := metaCapabilitiesSchema.Properties["serverBackup"]; !ok {
		t.Fatal("MetaCapabilities.serverBackup missing from OpenAPI")
	}
	if !containsString(metaCapabilitiesSchema.Required, "serverBackup") {
		t.Fatal("MetaCapabilities.serverBackup must be required in OpenAPI")
	}
	serverBackupSchema := requireOpenAPISchema(t, doc, "ServerBackupCapabilities")
	for _, name := range []string{"export", "restoreStaging"} {
		if _, ok := serverBackupSchema.Properties[name]; !ok {
			t.Fatalf("ServerBackupCapabilities.%s missing from OpenAPI", name)
		}
		if !containsString(serverBackupSchema.Required, name) {
			t.Fatalf("ServerBackupCapabilities.%s must be required in OpenAPI", name)
		}
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

	assertOpenAPIOperationHasResponse(t, doc, "/server/restore", http.MethodPost, http.StatusCreated)
	assertOpenAPIOperationHasResponse(t, doc, "/server/restore", http.MethodPost, http.StatusConflict)
	assertOpenAPIOperationHasResponse(t, doc, "/server/restore", http.MethodPost, http.StatusRequestEntityTooLarge)
	assertOpenAPIMultipartField(t, doc, "/server/restore", http.MethodPost, "bundle", true)
	assertOpenAPIMultipartField(t, doc, "/server/restore", http.MethodPost, "password", false)

	assertOpenAPIOperationResponseSchemaAtStatus(t, doc, "/server/import-portable/preview", http.MethodPost, http.StatusOK, "#/components/schemas/ServerPortableImportResponse")
	assertOpenAPIOperationHasResponse(t, doc, "/server/import-portable/preview", http.MethodPost, http.StatusConflict)
	assertOpenAPIOperationHasResponse(t, doc, "/server/import-portable/preview", http.MethodPost, http.StatusRequestEntityTooLarge)
	assertOpenAPIMultipartField(t, doc, "/server/import-portable/preview", http.MethodPost, "bundle", true)
	assertOpenAPIMultipartField(t, doc, "/server/import-portable/preview", http.MethodPost, "password", false)

	assertOpenAPIOperationResponseSchemaAtStatus(t, doc, "/server/import-portable", http.MethodPost, http.StatusOK, "#/components/schemas/ServerPortableImportResponse")
	assertOpenAPIOperationResponseSchemaAtStatus(t, doc, "/server/import-portable", http.MethodPost, http.StatusCreated, "#/components/schemas/ServerPortableImportResponse")
	assertOpenAPIOperationHasResponse(t, doc, "/server/import-portable", http.MethodPost, http.StatusConflict)
	assertOpenAPIOperationHasResponse(t, doc, "/server/import-portable", http.MethodPost, http.StatusRequestEntityTooLarge)
	assertOpenAPIMultipartField(t, doc, "/server/import-portable", http.MethodPost, "bundle", true)
	assertOpenAPIMultipartField(t, doc, "/server/import-portable", http.MethodPost, "password", false)
}

func TestOpenAPIBucketGovernanceSchemasCoverFrontendContract(t *testing.T) {
	t.Parallel()

	doc := loadOpenAPIDoc(t)

	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance", http.MethodGet, "#/components/schemas/BucketGovernanceView")
	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance/access", http.MethodGet, "#/components/schemas/BucketAccessView")
	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance/public-exposure", http.MethodGet, "#/components/schemas/BucketPublicExposureView")
	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance/protection", http.MethodGet, "#/components/schemas/BucketProtectionView")
	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance/versioning", http.MethodGet, "#/components/schemas/BucketVersioningView")
	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance/encryption", http.MethodGet, "#/components/schemas/BucketEncryptionView")
	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance/lifecycle", http.MethodGet, "#/components/schemas/BucketLifecycleView")
	assertOpenAPIOperationResponseSchema(t, doc, "/buckets/{bucket}/governance/sharing", http.MethodGet, "#/components/schemas/BucketSharingView")

	assertOpenAPIOperationHasResponse(t, doc, "/buckets/{bucket}/governance/access", http.MethodPut, http.StatusNoContent)
	assertOpenAPIOperationHasResponse(t, doc, "/buckets/{bucket}/governance/public-exposure", http.MethodPut, http.StatusNoContent)
	assertOpenAPIOperationHasResponse(t, doc, "/buckets/{bucket}/governance/protection", http.MethodPut, http.StatusNoContent)
	assertOpenAPIOperationHasResponse(t, doc, "/buckets/{bucket}/governance/versioning", http.MethodPut, http.StatusNoContent)
	assertOpenAPIOperationHasResponse(t, doc, "/buckets/{bucket}/governance/encryption", http.MethodPut, http.StatusNoContent)
	assertOpenAPIOperationHasResponse(t, doc, "/buckets/{bucket}/governance/lifecycle", http.MethodPut, http.StatusNoContent)
	assertOpenAPIOperationHasResponse(t, doc, "/buckets/{bucket}/governance/sharing", http.MethodPut, http.StatusOK)

	governanceSchema := requireOpenAPISchema(t, doc, "BucketGovernanceView")
	for _, name := range []string{"access", "publicExposure", "protection", "versioning", "encryption", "lifecycle", "sharing", "advanced"} {
		if _, ok := governanceSchema.Properties[name]; !ok {
			t.Fatalf("BucketGovernanceView.%s missing from OpenAPI", name)
		}
	}
	if !containsString(governanceSchema.Required, "provider") {
		t.Fatal("BucketGovernanceView.provider must be required in OpenAPI")
	}
	if !containsString(governanceSchema.Required, "bucket") {
		t.Fatal("BucketGovernanceView.bucket must be required in OpenAPI")
	}
	if !containsString(governanceSchema.Required, "capabilities") {
		t.Fatal("BucketGovernanceView.capabilities must be required in OpenAPI")
	}

	accessViewSchema := requireOpenAPISchema(t, doc, "BucketAccessView")
	for _, name := range []string{"objectOwnership", "advanced", "bindings", "etag", "storedAccessPolicies"} {
		if _, ok := accessViewSchema.Properties[name]; !ok {
			t.Fatalf("BucketAccessView.%s missing from OpenAPI", name)
		}
	}

	accessPutSchema := requireOpenAPISchema(t, doc, "BucketAccessPutRequest")
	for _, name := range []string{"objectOwnership", "bindings", "etag", "storedAccessPolicies"} {
		if _, ok := accessPutSchema.Properties[name]; !ok {
			t.Fatalf("BucketAccessPutRequest.%s missing from OpenAPI", name)
		}
	}

	publicExposurePutSchema := requireOpenAPISchema(t, doc, "BucketPublicExposurePutRequest")
	if _, ok := publicExposurePutSchema.Properties["publicAccessPrevention"]; !ok {
		t.Fatal("BucketPublicExposurePutRequest.publicAccessPrevention missing from OpenAPI")
	}

	protectionViewSchema := requireOpenAPISchema(t, doc, "BucketProtectionView")
	for _, name := range []string{"uniformAccess", "retention", "objectLock", "softDelete", "immutability"} {
		if _, ok := protectionViewSchema.Properties[name]; !ok {
			t.Fatalf("BucketProtectionView.%s missing from OpenAPI", name)
		}
	}

	protectionPutSchema := requireOpenAPISchema(t, doc, "BucketProtectionPutRequest")
	for _, name := range []string{"uniformAccess", "retention", "objectLock", "softDelete", "immutability"} {
		if _, ok := protectionPutSchema.Properties[name]; !ok {
			t.Fatalf("BucketProtectionPutRequest.%s missing from OpenAPI", name)
		}
	}

	versioningPutSchema := requireOpenAPISchema(t, doc, "BucketVersioningPutRequest")
	statusSchemaRef, ok := versioningPutSchema.Properties["status"]
	if !ok || statusSchemaRef == nil || statusSchemaRef.Value == nil {
		t.Fatal("BucketVersioningPutRequest.status missing from OpenAPI")
	}
	if got, want := statusSchemaRef.Value.Enum, []any{"enabled", "disabled", "suspended"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] {
		t.Fatalf("BucketVersioningPutRequest.status enum=%v, want %v", got, want)
	}

	encryptionPutSchema := requireOpenAPISchema(t, doc, "BucketEncryptionPutRequest")
	modeSchemaRef, ok := encryptionPutSchema.Properties["mode"]
	if !ok || modeSchemaRef == nil || modeSchemaRef.Value == nil {
		t.Fatal("BucketEncryptionPutRequest.mode missing from OpenAPI")
	}
	if got, want := modeSchemaRef.Value.Enum, []any{"sse_s3", "sse_kms"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("BucketEncryptionPutRequest.mode enum=%v, want %v", got, want)
	}

	if requireOpenAPISchema(t, doc, "BucketAccessBinding").Properties["role"] == nil {
		t.Fatal("BucketAccessBinding.role missing from OpenAPI")
	}
	if requireOpenAPISchema(t, doc, "BucketStoredAccessPolicy").Properties["id"] == nil {
		t.Fatal("BucketStoredAccessPolicy.id missing from OpenAPI")
	}
	lifecycleViewSchema := requireOpenAPISchema(t, doc, "BucketLifecycleView")
	if lifecycleViewSchema.Properties["rules"] == nil {
		t.Fatal("BucketLifecycleView.rules missing from OpenAPI")
	}
	lifecyclePutSchema := requireOpenAPISchema(t, doc, "BucketLifecyclePutRequest")
	if lifecyclePutSchema.Properties["rules"] == nil {
		t.Fatal("BucketLifecyclePutRequest.rules missing from OpenAPI")
	}

	createSchema := requireOpenAPISchema(t, doc, "BucketCreateRequest")
	if createSchema.Properties["defaults"] == nil {
		t.Fatal("BucketCreateRequest.defaults missing from OpenAPI")
	}
	createDefaultsSchema := requireOpenAPISchema(t, doc, "BucketCreateDefaults")
	for _, name := range []string{"access", "publicExposure", "versioning", "encryption"} {
		if _, ok := createDefaultsSchema.Properties[name]; !ok {
			t.Fatalf("BucketCreateDefaults.%s missing from OpenAPI", name)
		}
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

func requireOpenAPISchema(t *testing.T, doc *openapi3.T, name string) *openapi3.Schema {
	t.Helper()

	ref := doc.Components.Schemas[name]
	if ref == nil || ref.Value == nil {
		t.Fatalf("%s schema missing from OpenAPI", name)
	}
	return ref.Value
}

func assertOpenAPIOperationResponseSchema(t *testing.T, doc *openapi3.T, path, method, wantRef string) {
	t.Helper()

	assertOpenAPIOperationResponseSchemaAtStatus(t, doc, path, method, http.StatusOK, wantRef)
}

func assertOpenAPIOperationHasResponse(t *testing.T, doc *openapi3.T, path, method string, status int) {
	t.Helper()

	op := requireOpenAPIOperation(t, doc, path, method)
	_ = requireOpenAPIResponse(t, op, status)
}

func assertOpenAPIOperationResponseSchemaAtStatus(t *testing.T, doc *openapi3.T, path, method string, status int, wantRef string) {
	t.Helper()

	op := requireOpenAPIOperation(t, doc, path, method)
	resp := requireOpenAPIResponse(t, op, status)
	content, ok := resp.Content["application/json"]
	if !ok || content.Schema == nil {
		t.Fatalf("%s %s missing application/json response schema for status %d", method, path, status)
	}
	if content.Schema.Ref != wantRef {
		t.Fatalf("%s %s response schema=%q, want %q for status %d", method, path, content.Schema.Ref, wantRef, status)
	}
}

func assertOpenAPIMultipartField(t *testing.T, doc *openapi3.T, path, method, name string, required bool) {
	t.Helper()

	op := requireOpenAPIOperation(t, doc, path, method)
	if op.RequestBody == nil || op.RequestBody.Value == nil {
		t.Fatalf("%s %s missing request body", method, path)
	}
	content, ok := op.RequestBody.Value.Content["multipart/form-data"]
	if !ok || content.Schema == nil || content.Schema.Value == nil {
		t.Fatalf("%s %s missing multipart/form-data schema", method, path)
	}
	if _, ok := content.Schema.Value.Properties[name]; !ok {
		t.Fatalf("%s %s missing multipart field %q", method, path, name)
	}
	if required != containsString(content.Schema.Value.Required, name) {
		t.Fatalf("%s %s multipart field %q required=%t, want %t", method, path, name, containsString(content.Schema.Value.Required, name), required)
	}
}

func requireOpenAPIOperation(t *testing.T, doc *openapi3.T, path, method string) *openapi3.Operation {
	t.Helper()

	item := doc.Paths.Find(path)
	if item == nil {
		t.Fatalf("%s missing from OpenAPI", path)
	}
	op := item.GetOperation(method)
	if op == nil {
		t.Fatalf("%s %s missing from OpenAPI", method, path)
	}
	return op
}

func requireOpenAPIResponse(t *testing.T, op *openapi3.Operation, status int) *openapi3.Response {
	t.Helper()

	ref := op.Responses.Status(status)
	if ref == nil || ref.Value == nil {
		t.Fatalf("response %d missing from OpenAPI operation", status)
	}
	return ref.Value
}
