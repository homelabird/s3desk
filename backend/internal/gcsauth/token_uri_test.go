package gcsauth

import "testing"

func TestNormalizeTokenURI(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		raw     string
		wantErr bool
	}{
		{name: "empty defaults", raw: ""},
		{name: "official endpoint", raw: "https://oauth2.googleapis.com/token"},
		{name: "metadata endpoint", raw: "http://169.254.169.254/token", wantErr: true},
		{name: "lookalike host", raw: "https://oauth2.googleapis.com.evil.test/token", wantErr: true},
		{name: "query string", raw: "https://oauth2.googleapis.com/token?next=http://169.254.169.254", wantErr: true},
		{name: "fragment", raw: "https://oauth2.googleapis.com/token#metadata", wantErr: true},
		{name: "port", raw: "https://oauth2.googleapis.com:443/token", wantErr: true},
		{name: "wrong path", raw: "https://oauth2.googleapis.com/token/../metadata", wantErr: true},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := NormalizeTokenURI(tt.raw)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("NormalizeTokenURI(%q) error=nil, want error", tt.raw)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeTokenURI(%q) error=%v", tt.raw, err)
			}
			if got != DefaultTokenURI {
				t.Fatalf("NormalizeTokenURI(%q)=%q, want %q", tt.raw, got, DefaultTokenURI)
			}
		})
	}
}

func TestValidateServiceAccountJSONRejectsUnsafeTokenURI(t *testing.T) {
	t.Parallel()

	raw := `{"client_email":"demo@example.test","private_key":"placeholder","token_uri":"http://169.254.169.254/token"}`
	if err := ValidateServiceAccountJSON(raw); err == nil {
		t.Fatal("ValidateServiceAccountJSON() error=nil, want unsafe token_uri rejection")
	}
}
