package pull

import "testing"

func TestItemPassesFilter(t *testing.T) {
	tests := []struct {
		name, mode, keywords, title, content string
		want                                 bool
	}{
		{"disabled", "none", "spoiler", "Spoiler", "", true},
		{"block title", "blocklist", "广告\n推广", "这是广告", "", false},
		{"block content case insensitive", "blocklist", "SPONSOR", "News", "A sponsor message", false},
		{"block keeps unmatched", "blocklist", "广告", "News", "Useful article", true},
		{"allow matched", "allowlist", "Go\nRust", "Weekly RUST", "", true},
		{"allow rejects unmatched", "allowlist", "Go", "Java", "", false},
		{"allow empty rejects all", "allowlist", " \n", "Anything", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := itemPassesFilter(tt.mode, tt.keywords, tt.title, tt.content); got != tt.want {
				t.Fatalf("itemPassesFilter() = %v, want %v", got, tt.want)
			}
		})
	}
}
