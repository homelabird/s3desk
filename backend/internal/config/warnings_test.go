package config

import "testing"

func TestOperationalWarnings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		cfg  Config
		want []string
	}{
		{
			name: "remote access without allowed dirs and encryption key",
			cfg: Config{
				AllowRemote:      true,
				AllowedLocalDirs: nil,
			},
			want: []string{
				WarningRemoteWithoutAllowedLocalDirs,
				WarningEncryptionKeyUnset,
			},
		},
		{
			name: "local-only with encryption key has no warnings",
			cfg: Config{
				AllowRemote:      false,
				AllowedLocalDirs: nil,
				EncryptionKey:    "configured",
			},
			want: nil,
		},
		{
			name: "remote access with allowed dirs only warns about encryption",
			cfg: Config{
				AllowRemote:      true,
				AllowedLocalDirs: []string{" /srv/data "},
			},
			want: []string{
				WarningEncryptionKeyUnset,
			},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := OperationalWarnings(tc.cfg)
			if len(got) != len(tc.want) {
				t.Fatalf("warnings=%v, want %v", got, tc.want)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Fatalf("warnings[%d]=%q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}
