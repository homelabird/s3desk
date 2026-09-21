package downloadticket

import (
	"testing"
	"time"
)

func TestTicketScopeAndExpiry(t *testing.T) {
	now := time.Unix(1000, 0)
	secret := []byte("test-only-server-secret")
	ticket := Ticket{ProfileID: "profile", JobID: "job", Expires: now.Add(Lifetime).Unix()}
	signature := Sign(secret, ticket)
	for _, tt := range []struct {
		name      string
		ticket    Ticket
		secret    []byte
		signature string
		now       time.Time
		want      bool
	}{
		{"valid", ticket, secret, signature, now, true},
		{"last-second", ticket, secret, signature, now.Add(Lifetime - time.Second), true},
		{"expired", ticket, secret, signature, now.Add(Lifetime), false},
		{"future-too-far", ticket, secret, signature, now.Add(-time.Second), false},
		{"wrong-profile", Ticket{"other", "job", ticket.Expires}, secret, signature, now, false},
		{"wrong-job", Ticket{"profile", "other", ticket.Expires}, secret, signature, now, false},
		{"tampered-expiry", Ticket{"profile", "job", ticket.Expires - 1}, secret, signature, now, false},
		{"rotated-secret", ticket, []byte("rotated"), signature, now, false},
		{"missing-secret", ticket, nil, signature, now, false},
		{"missing-signature", ticket, secret, "", now, false},
		{"invalid-signature", ticket, secret, "%not-base64", now, false},
		{"empty-profile", Ticket{"", "job", ticket.Expires}, secret, signature, now, false},
		{"empty-job", Ticket{"profile", "", ticket.Expires}, secret, signature, now, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := Verify(tt.secret, tt.ticket, tt.signature, tt.now); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
func TestTicketDelimiterSeparation(t *testing.T) {
	secret := []byte("test-only-secret")
	a := Ticket{"a\nb", "c", 1234}
	b := Ticket{"a", "b\nc", 1234}
	if Sign(secret, a) == Sign(secret, b) {
		t.Fatal("ambiguous fields")
	}
}
