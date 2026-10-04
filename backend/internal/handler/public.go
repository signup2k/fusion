package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

const publicWindowSeconds = int64(7 * 24 * 60 * 60)

func (h *Handler) isPublicRequest(c *gin.Context) bool {
	if h.config == nil || h.config.PublicHost == "" {
		return false
	}
	host := (&url.URL{Host: c.Request.Host}).Hostname()
	return strings.EqualFold(strings.TrimSuffix(host, "."), h.config.PublicHost)
}

// publicHostMiddleware keeps all authenticated and mutating routes off the public hostname.
func (h *Handler) publicHostMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !h.isPublicRequest(c) {
			c.Next()
			return
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Header("Allow", "GET, HEAD")
			c.AbortWithStatusJSON(http.StatusMethodNotAllowed, gin.H{"error": "public reader is read-only"})
			return
		}
		cleanPath := path.Clean(c.Request.URL.Path)
		switch cleanPath {
		case "/", "/index.html", "/public.html", "/favicon.ico", "/icon-96.png", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png":
			c.Next()
		default:
			if strings.HasPrefix(cleanPath, "/api/public/") || strings.HasPrefix(cleanPath, "/assets/") {
				c.Next()
				return
			}
			c.AbortWithStatus(http.StatusNotFound)
		}
	}
}

func (h *Handler) publicAPIMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !h.isPublicRequest(c) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		// Content must disappear when its source is deleted or its public window expires.
		c.Header("Cache-Control", "no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Next()
	}
}

func (h *Handler) listPublicFeeds(c *gin.Context) {
	feeds, err := h.store.ListPublicFeeds()
	if err != nil {
		internalError(c, err, "list public feeds")
		return
	}
	dataResponse(c, feeds)
}

func (h *Handler) listPublicItems(c *gin.Context) {
	now := time.Now().Unix()
	params := store.PublicItemsParams{Since: now - publicWindowSeconds, Until: now, Limit: 30}
	if raw := c.Query("feed_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id <= 0 {
			badRequestError(c, "invalid feed_id")
			return
		}
		params.FeedID = id
	}
	if raw := c.Query("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit <= 0 {
			badRequestError(c, "invalid limit")
			return
		}
		params.Limit = min(limit, maxListLimit)
	}
	if raw := c.Query("before"); raw != "" {
		pubDate, id, err := parseCursor(raw)
		if err != nil || pubDate <= 0 || id <= 0 {
			badRequestError(c, "invalid before")
			return
		}
		params.BeforePubDate, params.BeforeID = &pubDate, &id
	}
	limit := params.Limit
	params.Limit++
	items, err := h.store.ListPublicItems(params)
	if err != nil {
		internalError(c, err, "list public items")
		return
	}
	var nextCursor *string
	if len(items) > limit {
		items = items[:limit]
		last := items[len(items)-1]
		cursor := fmt.Sprintf("%d_%d", last.PubDate, last.ID)
		nextCursor = &cursor
	}
	c.JSON(http.StatusOK, gin.H{
		"data": items, "next_cursor": nextCursor,
		"window_start": params.Since, "window_end": now,
	})
}

func (h *Handler) getPublicItem(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		badRequestError(c, "invalid id")
		return
	}
	now := time.Now().Unix()
	item, err := h.store.GetPublicItem(id, now-publicWindowSeconds, now)
	if errors.Is(err, store.ErrNotFound) {
		notFoundError(c, "item")
		return
	}
	if err != nil {
		internalError(c, err, "get public item")
		return
	}
	dataResponse(c, item)
}
