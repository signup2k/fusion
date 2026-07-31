package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/0x2E/fusion/internal/model"
	"github.com/gin-gonic/gin"
)

func TestMarkItemsBatchValidation(t *testing.T) {
	ids := make([]int64, maxBatchUpdateIDs+1)
	for i := range ids {
		ids[i] = int64(i + 1)
	}

	tests := []struct {
		name    string
		path    string
		handler gin.HandlerFunc
		body    any
	}{
		{name: "read rejects too many ids", path: "/api/items/-/read", handler: (&Handler{}).markItemsRead, body: gin.H{"ids": ids}},
		{name: "unread rejects empty ids", path: "/api/items/-/unread", handler: (&Handler{}).markItemsUnread, body: gin.H{"ids": []int64{}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newTestRouter()
			r.PATCH(tt.path, tt.handler)

			w := performRequest(
				r,
				http.MethodPatch,
				tt.path,
				mustJSONBody(t, tt.body),
				map[string]string{"Content-Type": "application/json"},
			)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected status 400, got %d", w.Code)
			}
		})
	}
}

func TestMarkAllItemsReadForGroup(t *testing.T) {
	h, st := newFeverTestHandler(t)

	group1, err := st.CreateGroup("Group 1")
	if err != nil {
		t.Fatalf("CreateGroup 1: %v", err)
	}
	group2, err := st.CreateGroup("Group 2")
	if err != nil {
		t.Fatalf("CreateGroup 2: %v", err)
	}
	feed1, err := st.CreateFeed(group1.ID, "Feed 1", "https://example.com/feed-1", "https://example.com", "")
	if err != nil {
		t.Fatalf("CreateFeed 1: %v", err)
	}
	feed2, err := st.CreateFeed(group2.ID, "Feed 2", "https://example.com/feed-2", "https://example.com", "")
	if err != nil {
		t.Fatalf("CreateFeed 2: %v", err)
	}
	item1, err := st.CreateItem(feed1.ID, "item-1", "Item 1", "https://example.com/1", "Content 1", 100)
	if err != nil {
		t.Fatalf("CreateItem 1: %v", err)
	}
	item2, err := st.CreateItem(feed2.ID, "item-2", "Item 2", "https://example.com/2", "Content 2", 200)
	if err != nil {
		t.Fatalf("CreateItem 2: %v", err)
	}

	r := newTestRouter()
	r.PATCH("/api/items/-/read-all", h.markAllItemsRead)
	w := performRequest(
		r,
		http.MethodPatch,
		"/api/items/-/read-all",
		mustJSONBody(t, gin.H{"group_id": group1.ID}),
		map[string]string{"Content-Type": "application/json"},
	)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d (body=%s)", w.Code, w.Body.String())
	}

	updated1, err := st.GetItem(item1.ID)
	if err != nil {
		t.Fatalf("GetItem 1: %v", err)
	}
	updated2, err := st.GetItem(item2.ID)
	if err != nil {
		t.Fatalf("GetItem 2: %v", err)
	}
	if updated1.Unread {
		t.Error("expected the selected group's item to be read")
	}
	if !updated2.Unread {
		t.Error("expected the other group's item to remain unread")
	}
}

func TestListItemsPreviewKeepsDetailContent(t *testing.T) {
	h, st := newFeverTestHandler(t)

	group, err := st.CreateGroup("Preview Group")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	feed, err := st.CreateFeed(group.ID, "Preview Feed", "https://example.com/preview-feed", "https://example.com", "")
	if err != nil {
		t.Fatalf("CreateFeed: %v", err)
	}
	content := "<p>" + strings.Repeat("article content ", 300) + "</p>"
	item, err := st.CreateItem(feed.ID, "preview-item", "Preview Item", "https://example.com/preview", content, 100)
	if err != nil {
		t.Fatalf("CreateItem: %v", err)
	}

	r := newTestRouter()
	r.GET("/api/items", h.listItems)
	r.GET("/api/items/:id", h.getItem)

	w := performRequest(r, http.MethodGet, "/api/items?preview=true", nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected preview status 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	var page struct {
		Data []model.Item `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatalf("unmarshal preview response: %v", err)
	}
	if len(page.Data) != 1 {
		t.Fatalf("expected one preview item, got %d", len(page.Data))
	}
	if page.Data[0].Content != "" {
		t.Errorf("expected preview response to omit full content, got %q", page.Data[0].Content)
	}
	if page.Data[0].ContentPreview != content[:2048] {
		t.Errorf(
			"expected a 2048-character preview, got %d characters",
			len(page.Data[0].ContentPreview),
		)
	}

	w = performRequest(r, http.MethodGet, "/api/items/"+strconv.FormatInt(item.ID, 10), nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected detail status 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	var detail struct {
		Data model.Item `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil {
		t.Fatalf("unmarshal detail response: %v", err)
	}
	if detail.Data.Content != content {
		t.Errorf("expected full detail content %q, got %q", content, detail.Data.Content)
	}
}

func TestListItemsCursorPagination(t *testing.T) {
	h, st := newFeverTestHandler(t)

	group, err := st.CreateGroup("G")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	feed, err := st.CreateFeed(group.ID, "Feed", "https://example.com/feed", "https://example.com", "")
	if err != nil {
		t.Fatalf("CreateFeed: %v", err)
	}
	// pub_dates descend so ordering is deterministic: item3 > item2 > item1.
	item1, err := st.CreateItem(feed.ID, "g1", "Item 1", "https://example.com/1", "c", 100)
	if err != nil {
		t.Fatalf("CreateItem 1: %v", err)
	}
	item2, err := st.CreateItem(feed.ID, "g2", "Item 2", "https://example.com/2", "c", 200)
	if err != nil {
		t.Fatalf("CreateItem 2: %v", err)
	}
	item3, err := st.CreateItem(feed.ID, "g3", "Item 3", "https://example.com/3", "c", 300)
	if err != nil {
		t.Fatalf("CreateItem 3: %v", err)
	}

	r := newTestRouter()
	r.GET("/api/items", h.listItems)

	// First page: no cursor, expect the 2 newest items and a non-null next_cursor.
	w := performRequest(r, http.MethodGet, "/api/items?limit=2", nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	var page struct {
		Data       []model.Item `json:"data"`
		Total      int          `json:"total"`
		NextCursor *string      `json:"next_cursor"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(page.Data) != 2 {
		t.Fatalf("expected 2 items on first page, got %d", len(page.Data))
	}
	if page.Data[0].ID != item3.ID || page.Data[1].ID != item2.ID {
		t.Errorf("expected first page [item3, item2], got ids [%d, %d]", page.Data[0].ID, page.Data[1].ID)
	}
	if page.Total != 3 {
		t.Errorf("expected total=3, got %d", page.Total)
	}
	if page.NextCursor == nil {
		t.Fatal("expected non-null next_cursor on a full first page")
	}
	wantCursor := "200_" + strconv.FormatInt(item2.ID, 10)
	if *page.NextCursor != wantCursor {
		t.Errorf("expected next_cursor %q, got %q", wantCursor, *page.NextCursor)
	}

	// Second page: use the cursor, expect the remaining item and a null next_cursor.
	w = performRequest(r, http.MethodGet, "/api/items?limit=2&before="+*page.NextCursor, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	page = struct {
		Data       []model.Item `json:"data"`
		Total      int          `json:"total"`
		NextCursor *string      `json:"next_cursor"`
	}{}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(page.Data) != 1 || page.Data[0].ID != item1.ID {
		t.Errorf("expected second page [item1], got %+v", page.Data)
	}
	if page.NextCursor != nil {
		t.Errorf("expected null next_cursor on final page, got %q", *page.NextCursor)
	}
}

func TestListItemsCursorInvalidBefore(t *testing.T) {
	h, _ := newFeverTestHandler(t)

	r := newTestRouter()
	r.GET("/api/items", h.listItems)

	w := performRequest(r, http.MethodGet, "/api/items?before=not-a-cursor", nil, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for malformed cursor, got %d", w.Code)
	}
}

func TestListItemsCursorWithOrderByCreatedAt(t *testing.T) {
	h, _ := newFeverTestHandler(t)

	r := newTestRouter()
	r.GET("/api/items", h.listItems)

	w := performRequest(r, http.MethodGet, "/api/items?order_by=created_at&before=100_1", nil, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for before cursor with order_by=created_at, got %d", w.Code)
	}
}
