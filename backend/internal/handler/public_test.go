package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/model"
	"github.com/0x2E/fusion/internal/store"
)

const testPublicHost = "public.example.test"

func TestPublicItemsWindowPaginationAndStateIsolation(t *testing.T) {
	h, st := newFeverTestHandler(t)
	h.config.PublicHost = testPublicHost
	r := h.SetupRouter()
	feed, err := st.CreateFeed(1, "Public feed", "https://example.com/feed?token=private", "https://example.com", "https://private-proxy.example")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Unix()
	content := "<p>" + strings.Repeat("Article content ", 300) + "</p>"
	var recent []*model.Item
	for i := range 3 {
		item, err := st.CreateItem(feed.ID, fmt.Sprintf("recent-%d", i), fmt.Sprintf("Recent %d", i), "https://example.com/article", content, now-60)
		if err != nil {
			t.Fatal(err)
		}
		recent = append(recent, item)
	}
	if err := st.UpdateItemUnread(recent[1].ID, false); err != nil {
		t.Fatal(err)
	}
	old, err := st.CreateItem(feed.ID, "old", "Old", "https://example.com/old", "old content", now-publicWindowSeconds-60)
	if err != nil {
		t.Fatal(err)
	}
	future, err := st.CreateItem(feed.ID, "future", "Future", "https://example.com/future", "future content", now+3600)
	if err != nil {
		t.Fatal(err)
	}

	var page struct {
		Data        []model.PublicItem `json:"data"`
		NextCursor  *string            `json:"next_cursor"`
		WindowStart int64              `json:"window_start"`
		WindowEnd   int64              `json:"window_end"`
	}
	target := "http://" + testPublicHost + "/api/public/items?limit=2&since=0&unread=true&preview=false&order_by=created_at"
	w := performRequest(r, http.MethodGet, target, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 2 || page.Data[0].ID != recent[2].ID || page.Data[1].ID != recent[1].ID || page.NextCursor == nil {
		t.Fatalf("unexpected first page: %+v", page)
	}
	if page.WindowEnd-page.WindowStart != publicWindowSeconds {
		t.Fatalf("unexpected public window: %+v", page)
	}
	if page.Data[0].Content != "" || len(page.Data[0].ContentPreview) != 2048 {
		t.Fatal("list must contain only bounded content previews")
	}
	for _, field := range []string{"unread", "starred", "guid", "created_at", "fetch_state", "proxy"} {
		if strings.Contains(w.Body.String(), `"`+field+`":`) {
			t.Fatalf("public response leaked %s", field)
		}
	}
	if w.Header().Get("Cache-Control") != "no-store" || len(w.Result().Cookies()) != 0 {
		t.Fatal("public responses must not cache content or create sessions")
	}

	w = performRequest(r, http.MethodGet, target+"&before="+url.QueryEscape(*page.NextCursor), nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("second page: %d %s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 1 || page.Data[0].ID != recent[0].ID || page.NextCursor != nil {
		t.Fatalf("unexpected last page: %+v", page)
	}

	for _, item := range append(append([]*model.Item{}, recent...), old, future) {
		w = performRequest(r, http.MethodGet, "http://"+testPublicHost+"/api/public/items/"+strconv.FormatInt(item.ID, 10), nil, nil)
		if item.ID == old.ID || item.ID == future.ID {
			if w.Code != http.StatusNotFound {
				t.Fatalf("out-of-window detail returned %d", w.Code)
			}
			continue
		}
		var detail struct{ Data model.PublicItem }
		if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil || w.Code != http.StatusOK || detail.Data.Content != content || strings.Contains(w.Body.String(), `"unread":`) {
			t.Fatalf("unexpected public detail: %d %s", w.Code, w.Body.String())
		}
		stored, err := st.GetItem(item.ID)
		if err != nil || stored.Unread != (item.ID != recent[1].ID) {
			t.Fatalf("public reading changed private state: item %d, error %v", item.ID, err)
		}
	}
}

func TestPublicFeedsFollowSourceChanges(t *testing.T) {
	h, st := newFeverTestHandler(t)
	h.config.PublicHost = testPublicHost
	r := h.SetupRouter()
	readFeeds := func() []model.PublicFeed {
		t.Helper()
		w := performRequest(r, http.MethodGet, "http://"+testPublicHost+"/api/public/feeds", nil, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("feeds: %d %s", w.Code, w.Body.String())
		}
		for _, field := range []string{"link", "unread_count", "item_count", "filter_keywords", "proxy", "fetch_state"} {
			if strings.Contains(w.Body.String(), `"`+field+`":`) {
				t.Fatalf("public feed response leaked %s", field)
			}
		}
		var response struct{ Data []model.PublicFeed }
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response.Data
	}
	if len(readFeeds()) != 0 {
		t.Fatal("expected no sources initially")
	}
	feed, err := st.CreateFeed(1, "New source", "https://example.com/feed?token=private", "https://example.com", "https://private-proxy.example")
	if err != nil {
		t.Fatal(err)
	}
	if feeds := readFeeds(); len(feeds) != 1 || feeds[0].ID != feed.ID {
		t.Fatalf("new source not visible: %+v", feeds)
	}
	name := "Renamed source"
	if err := st.UpdateFeed(feed.ID, store.UpdateFeedParams{Name: &name}); err != nil {
		t.Fatal(err)
	}
	if feeds := readFeeds(); len(feeds) != 1 || feeds[0].Name != name {
		t.Fatalf("renamed source not visible: %+v", feeds)
	}
	item, err := st.CreateItem(feed.ID, "new", "New article", "https://example.com/new", "content", time.Now().Unix()-10)
	if err != nil {
		t.Fatal(err)
	}
	otherFeed, err := st.CreateFeed(1, "Other source", "https://example.org/feed", "https://example.org", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateItem(otherFeed.ID, "other", "Other article", "https://example.org/article", "content", time.Now().Unix()-10); err != nil {
		t.Fatal(err)
	}
	w := performRequest(r, http.MethodGet, fmt.Sprintf("http://%s/api/public/items?feed_id=%d", testPublicHost, feed.ID), nil, nil)
	var filtered struct{ Data []model.PublicItem }
	if err := json.Unmarshal(w.Body.Bytes(), &filtered); err != nil || w.Code != http.StatusOK || len(filtered.Data) != 1 || filtered.Data[0].ID != item.ID {
		t.Fatalf("new article or source filter failed: %d %s", w.Code, w.Body.String())
	}
	if err := st.DeleteFeed(feed.ID); err != nil {
		t.Fatal(err)
	}
	if feeds := readFeeds(); len(feeds) != 1 || feeds[0].ID != otherFeed.ID {
		t.Fatalf("deleted source still visible or other source removed: %+v", feeds)
	}
	w = performRequest(r, http.MethodGet, "http://"+testPublicHost+"/api/public/items/"+strconv.FormatInt(item.ID, 10), nil, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("deleted source's article still visible: %d", w.Code)
	}
}

func TestPublicHostRejectsPrivateRoutesEvenWithSession(t *testing.T) {
	h, _ := newFeverTestHandler(t)
	h.config.PublicHost = testPublicHost
	h.config.CORSAllowedOrigins = []string{"https://main.example.test"}
	h.sessions["owner-session"] = time.Now().Unix() + 3600
	cookie := &http.Cookie{Name: "session", Value: "owner-session"}
	r := h.SetupRouter()
	for _, route := range []string{"/api/feeds", "/api/groups", "/api/items", "/api/items/1", "/api/search", "/api/bookmarks", "/api/oidc/enabled", "/login", "/feeds", "/fever", "/fever.php", "/api/public/../feeds"} {
		w := performRequest(r, http.MethodGet, "http://"+testPublicHost+route, nil, nil, cookie)
		if w.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", route, w.Code)
		}
	}
	for _, route := range []string{"/api/sessions", "/api/feeds", "/api/feeds/refresh", "/api/items/-/read", "/api/items/-/read-all", "/api/bookmarks", "/api/public/items", "/fever.php"} {
		for _, method := range []string{http.MethodPost, http.MethodPatch, http.MethodDelete} {
			w := performRequest(r, method, "http://"+testPublicHost+route, strings.NewReader(`{}`), nil, cookie)
			if w.Code != http.StatusMethodNotAllowed {
				t.Errorf("%s %s = %d, want 405", method, route, w.Code)
			}
		}
	}
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		w := performRequest(r, method, "http://"+testPublicHost+"/assets/not-a-real-file.js", nil, nil)
		if w.Code != http.StatusNotFound {
			t.Errorf("missing asset = %d, want 404", w.Code)
		}
	}

	w := performRequest(r, http.MethodGet, "http://main.example.test/api/feeds", nil, nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("main site's API lost authentication: %d", w.Code)
	}
	w = performRequest(r, http.MethodGet, "http://main.example.test/api/feeds", nil, nil, cookie)
	if w.Code != http.StatusOK {
		t.Fatalf("owner can no longer use main site: %d", w.Code)
	}
	w = performRequest(r, http.MethodGet, "http://main.example.test/api/feeds", nil, map[string]string{"Origin": "https://" + testPublicHost}, cookie)
	if w.Code != http.StatusForbidden {
		t.Fatalf("public origin gained access to private API: %d", w.Code)
	}
	w = performRequest(r, http.MethodGet, "http://"+testPublicHost+"/api/public/feeds", nil, map[string]string{"Origin": "https://" + testPublicHost})
	if w.Code != http.StatusOK || w.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatalf("public same-origin GET failed: %d %s", w.Code, w.Body.String())
	}
	w = performRequest(r, http.MethodGet, "http://main.example.test/api/public/feeds", nil, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("public API available on unconfigured host: %d", w.Code)
	}
	w = performRequest(r, http.MethodGet, "http://PUBLIC.EXAMPLE.TEST:8010/api/public/feeds", nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("normalized public host failed: %d", w.Code)
	}
}

func TestPublicReaderDisabledAndInputValidation(t *testing.T) {
	h, _ := newFeverTestHandler(t)
	w := performRequest(h.SetupRouter(), http.MethodGet, "http://"+testPublicHost+"/api/public/feeds", nil, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("public reader enabled without opt-in: %d", w.Code)
	}
	h.config.PublicHost = testPublicHost
	r := h.SetupRouter()
	for _, query := range []string{"feed_id=0", "feed_id=-1", "feed_id=abc", "limit=0", "limit=-1", "limit=abc", "before=invalid", "before=100_-1"} {
		w = performRequest(r, http.MethodGet, "http://"+testPublicHost+"/api/public/items?"+query, nil, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("query %q = %d, want 400", query, w.Code)
		}
	}
}
