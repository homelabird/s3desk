package multipartverify

import (
	"reflect"
	"testing"
)

func TestCompleteInventory(t *testing.T) {
	valid := []Part{{2, 2, "etag-two"}, {1, 4, "etag-one"}}
	cases := []struct {
		name        string
		parts       []Part
		size, chunk int64
		valid       bool
	}{
		{"out of order", valid, 6, 4, true},
		{"missing part", valid[:1], 6, 4, false},
		{"duplicate", []Part{valid[0], valid[0]}, 6, 4, false},
		{"negative index", []Part{{-1, 4, "e"}, valid[0]}, 6, 4, false},
		{"zero index", []Part{{0, 4, "e"}, valid[0]}, 6, 4, false},
		{"out of range", []Part{{3, 4, "e"}, valid[0]}, 6, 4, false},
		{"wrong tail size", []Part{{1, 4, "e"}, {2, 4, "e"}}, 6, 4, false},
		{"short middle", []Part{{1, 3, "e"}, {2, 2, "e"}}, 6, 4, false},
		{"missing etag", []Part{{1, 4, ""}, valid[0]}, 6, 4, false},
		{"zero chunk", valid, 6, 0, false},
		{"zero file", nil, 0, 4, false},
		{"over part limit", nil, 10001, 1, false},
		{"overflow resistant", nil, 9223372036854775807, 1, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Complete(tc.parts, tc.size, tc.chunk)
			if (err == nil) != tc.valid {
				t.Fatalf("got %v %v", got, err)
			}
			if tc.valid && !reflect.DeepEqual(got, []Part{valid[1], valid[0]}) {
				t.Fatalf("order %v", got)
			}
		})
	}
}
