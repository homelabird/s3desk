// Package downloadticket signs short-lived, resource-scoped browser download links.
// It must not be used for API authentication or arbitrary filesystem access.
package downloadticket

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"time"
)

const Lifetime = 5 * time.Minute

type Ticket struct {
	ProfileID string `json:"profileId"`
	JobID     string `json:"jobId"`
	Expires   int64  `json:"expires"`
}

func Sign(secret []byte, t Ticket) string {
	// Domain separation and JSON encoding prevent collision with object proxy
	// signatures, embedded delimiters, or any other use of the server secret.
	data, _ := json.Marshal(t)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte("s3desk:job-artifact:v1\x00"))
	_, _ = mac.Write(data)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func Verify(secret []byte, t Ticket, signature string, now time.Time) bool {
	if len(secret) == 0 || t.ProfileID == "" || t.JobID == "" || t.Expires <= now.Unix() || t.Expires > now.Add(Lifetime).Unix() {
		return false
	}
	received, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil {
		return false
	}
	expected, _ := base64.RawURLEncoding.DecodeString(Sign(secret, t))
	return hmac.Equal(received, expected)
}
