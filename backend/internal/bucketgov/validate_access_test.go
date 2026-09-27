package bucketgov

import (
	"encoding/json"
	"s3desk/internal/models"
	"strings"
	"testing"
)

func TestAzureAccessPermissionValidation(t *testing.T) {
	for _, tc := range []struct {
		permission string
		invalid    bool
	}{
		{"rxtfi", false}, {"", false}, {"u", true}, {"R", true}, {"rr", true},
	} {
		req := models.BucketAccessPutRequest{StoredAccessPolicies: []models.BucketStoredAccessPolicy{{ID: "reader", Permission: tc.permission}}}
		err := ValidateAccessPut(newValidationContext(models.ProfileProviderAzureBlob, "demo"), req)
		if (err != nil) != tc.invalid {
			t.Errorf("permission=%q: err=%v", tc.permission, err)
		}
	}
}

func TestAzureAccessIdentifierValidation(t *testing.T) {
	for _, tc := range []struct {
		ids     []string
		invalid bool
	}{
		{[]string{"read", "Read"}, false}, {[]string{"read", " read "}, true},
		{[]string{strings.Repeat("한", 64)}, false}, {[]string{strings.Repeat("한", 65)}, true},
	} {
		req := models.BucketAccessPutRequest{}
		for _, id := range tc.ids {
			req.StoredAccessPolicies = append(req.StoredAccessPolicies, models.BucketStoredAccessPolicy{ID: id})
		}
		err := ValidateAccessPut(newValidationContext(models.ProfileProviderAzureBlob, "demo"), req)
		if (err != nil) != tc.invalid {
			t.Errorf("ids=%q: err=%v", tc.ids, err)
		}
	}
}

func TestGCSAccessRejectsEmptyBindings(t *testing.T) {
	for _, tc := range []struct {
		name     string
		bindings []models.BucketAccessBinding
		invalid  bool
	}{
		{"clear policy", nil, false},
		{"valid", []models.BucketAccessBinding{{Role: "roles/storage.objectViewer", Members: []string{"allUsers"}}}, false},
		{"empty role", []models.BucketAccessBinding{{Role: " ", Members: []string{"allUsers"}}}, true},
		{"empty members", []models.BucketAccessBinding{{Role: "roles/storage.objectViewer"}}, true},
		{"blank member", []models.BucketAccessBinding{{Role: "roles/storage.objectViewer", Members: []string{"allUsers", " "}}}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateAccessPut(newValidationContext(models.ProfileProviderGcpGcs, "demo"), models.BucketAccessPutRequest{Bindings: tc.bindings})
			if (err != nil) != tc.invalid {
				t.Fatalf("err=%v, invalid=%v", err, tc.invalid)
			}
		})
	}
}

func TestGCSAccessConditionValidation(t *testing.T) {
	for _, tc := range []struct {
		raw     string
		invalid bool
	}{
		{"", false}, {`{"title":"limited","expression":"true"}`, false},
		{`null`, true}, {`[]`, true}, {`"true"`, true}, {`{}`, true},
		{`{"title":"limited","expression":false}`, true},
		{`{"title":"limited","expression":"true","description":42}`, true},
		{`{"title":"limited","expression":"true","location":42}`, true},
	} {
		req := models.BucketAccessPutRequest{Bindings: []models.BucketAccessBinding{{Role: "roles/storage.objectViewer", Members: []string{"allUsers"}, Condition: json.RawMessage(tc.raw)}}}
		err := ValidateAccessPut(newValidationContext(models.ProfileProviderGcpGcs, "demo"), req)
		if (err != nil) != tc.invalid {
			t.Errorf("condition=%q: %v", tc.raw, err)
		}
	}
}
