package ocicli

import (
	"reflect"
	"testing"
)

func TestRetentionDurationArguments(t *testing.T) {
	for _, tc := range []struct {
		amount int
		unit   string
		update bool
		want   []string
		bad    bool
	}{
		{2, "YEARS", false, []string{"--time-amount", "2", "--time-unit", "YEARS"}, false},
		{7, "DAYS", true, []string{"--time-amount", "7", "--time-unit", "DAYS"}, false},
		{0, "", false, nil, false}, {0, "", true, []string{"--time-amount", ""}, false},
		{1, "", false, nil, true}, {0, "DAYS", false, nil, true}, {1, "MONTHS", true, nil, true},
	} {
		got, err := retentionDurationArgs(tc.amount, tc.unit, tc.update)
		if (err != nil) != tc.bad || !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("case=%+v got=%v err=%v", tc, got, err)
		}
	}
}
