package store

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/0x2E/fusion/internal/model"
)

// PublicItemsParams bounds public queries to a server-selected publication window.
type PublicItemsParams struct {
	Since         int64
	Until         int64
	FeedID        int64
	Limit         int
	BeforePubDate *int64
	BeforeID      *int64
}

func (s *Store) ListPublicFeeds() ([]*model.PublicFeed, error) {
	rows, err := s.db.Query(`SELECT id, name, site_url FROM feeds ORDER BY name COLLATE NOCASE, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	feeds := []*model.PublicFeed{}
	for rows.Next() {
		feed := &model.PublicFeed{}
		if err := rows.Scan(&feed.ID, &feed.Name, &feed.SiteURL); err != nil {
			return nil, err
		}
		feeds = append(feeds, feed)
	}
	return feeds, rows.Err()
}

func (s *Store) ListPublicItems(params PublicItemsParams) ([]*model.PublicItem, error) {
	query := `
		SELECT id, feed_id, title, link, substr(content, 1, 2048), pub_date
		FROM items
		WHERE pub_date >= :since AND pub_date <= :until
	`
	args := []any{sql.Named("since", params.Since), sql.Named("until", params.Until)}
	if params.FeedID > 0 {
		query += ` AND feed_id = :feed_id`
		args = append(args, sql.Named("feed_id", params.FeedID))
	}
	if params.BeforePubDate != nil && params.BeforeID != nil {
		query += ` AND (pub_date < :before_pub_date OR (pub_date = :before_pub_date AND id < :before_id))`
		args = append(args, sql.Named("before_pub_date", *params.BeforePubDate), sql.Named("before_id", *params.BeforeID))
	}
	query += ` ORDER BY pub_date DESC, id DESC LIMIT :limit`
	args = append(args, sql.Named("limit", params.Limit))
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []*model.PublicItem{}
	for rows.Next() {
		item := &model.PublicItem{}
		if err := rows.Scan(&item.ID, &item.FeedID, &item.Title, &item.Link, &item.ContentPreview, &item.PubDate); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) GetPublicItem(id, since, until int64) (*model.PublicItem, error) {
	item := &model.PublicItem{}
	err := s.db.QueryRow(`
		SELECT id, feed_id, title, link, content, pub_date
		FROM items
		WHERE id = :id AND pub_date >= :since AND pub_date <= :until
	`, sql.Named("id", id), sql.Named("since", since), sql.Named("until", until)).Scan(
		&item.ID, &item.FeedID, &item.Title, &item.Link, &item.Content, &item.PubDate,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("%w: item", ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	return item, nil
}
