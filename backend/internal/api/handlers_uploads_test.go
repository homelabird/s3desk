package api

import "testing"

func TestSanitizeUploadPath(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{in: "", want: ""},
		{in: "   ", want: ""},
		{in: ".", want: ""},
		{in: "..", want: ""},
		{in: "/", want: ""},
		{in: "a.txt", want: "a.txt"},
		{in: "a/b.txt", want: "a/b.txt"},
		{in: "a\\b\\c.txt", want: "a/b/c.txt"},
		{in: "../c.txt", want: ""},
		{in: "a/../c.txt", want: "c.txt"},
		{in: "dir/", want: "dir"},
		{in: "  spaced name.txt  ", want: "spaced name.txt"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.in, func(t *testing.T) {
			t.Parallel()
			got := sanitizeUploadPath(tc.in)
			if got != tc.want {
				t.Fatalf("sanitizeUploadPath(%q)=%q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
