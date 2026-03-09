package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestHandleListObjectsMapsDecodeFailureToUpstreamInvalidCredentials(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeRclone(t, `
cmd=''
for arg in "$@"; do
  if [ "$arg" = "lsjson" ]; then cmd='lsjson'; fi
done
if [ "$cmd" = "lsjson" ]; then
  printf '['
  echo "NotAuthenticated: The required information to complete authentication was not provided." >&2
  exit 9
fi
exit 0
`))

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/my-test/objects?delimiter=%2F&maxKeys=200", nil)
	req = withBucketParam(req, "my-test")
	req = withProfileSecrets(req, models.ProfileSecrets{
		Provider:              models.ProfileProviderOciObjectStorage,
		Region:                "ap-tokyo-1",
		OciNamespace:          "nrszxupgigok",
		OciCompartment:        "ocid1.compartment.oc1..aaaaaaaaexample",
		OciEndpoint:           "https://objectstorage.ap-tokyo-1.oraclecloud.com",
		OciAuthProvider:       "user_principal_auth",
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	rr := httptest.NewRecorder()

	srv.handleListObjects(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusUnauthorized)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "invalid_credentials" {
		t.Fatalf("code=%q, want invalid_credentials", errResp.Error.Code)
	}
	if errResp.Error.NormalizedError == nil || errResp.Error.NormalizedError.Code != models.NormalizedErrorInvalidCredentials {
		t.Fatalf("normalizedError=%+v, want invalid_credentials", errResp.Error.NormalizedError)
	}
}
