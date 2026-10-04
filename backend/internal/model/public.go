package model

// PublicGroup contains the shared name of a subscription group.
type PublicGroup struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// PublicFeed contains only the source metadata needed by the public reader.
type PublicFeed struct {
	ID      int64  `json:"id"`
	GroupID int64  `json:"group_id"`
	Name    string `json:"name"`
	SiteURL string `json:"site_url,omitempty"`
}

// PublicItem has no read state, bookmark association, or internal feed metadata.
type PublicItem struct {
	ID             int64  `json:"id"`
	FeedID         int64  `json:"feed_id"`
	Title          string `json:"title"`
	Link           string `json:"link"`
	Content        string `json:"content,omitempty"`
	ContentPreview string `json:"content_preview,omitempty"`
	PubDate        int64  `json:"pub_date"`
}
