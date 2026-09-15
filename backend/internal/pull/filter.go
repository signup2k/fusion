package pull

import "strings"

func itemPassesFilter(mode, rawKeywords, title, content string) bool {
	if mode == "none" || mode == "" {
		return true
	}

	haystack := strings.ToLower(title + "\n" + content)
	matched := false
	for _, line := range strings.Split(rawKeywords, "\n") {
		keyword := strings.ToLower(strings.TrimSpace(line))
		if keyword != "" && strings.Contains(haystack, keyword) {
			matched = true
			break
		}
	}

	if mode == "allowlist" {
		return matched
	}
	return !matched
}
