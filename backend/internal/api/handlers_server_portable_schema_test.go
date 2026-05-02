package api

import (
	"reflect"
	"testing"

	"s3desk/internal/db"
)

func TestPortableEntityOrderMatchesDBPortableTables(t *testing.T) {
	if !reflect.DeepEqual(portableEntityOrder, db.PortableDataTableNames()) {
		t.Fatalf("portable entity order = %#v, want %#v", portableEntityOrder, db.PortableDataTableNames())
	}
}
