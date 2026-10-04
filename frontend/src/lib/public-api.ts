export interface PublicFeed {
  id: number;
  name: string;
  site_url?: string;
}

export interface PublicItem {
  id: number;
  feed_id: number;
  title: string;
  link: string;
  content?: string;
  content_preview?: string;
  pub_date: number;
}

interface PublicItemPage {
  data: PublicItem[];
  next_cursor: string | null;
  window_start: number;
  window_end: number;
}

export class PublicAPIError extends Error {
  status: number;

  constructor(status: number) {
    super(`Public reader request failed: ${status}`);
    this.status = status;
  }
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/public${path}`, {
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new PublicAPIError(response.status);
  return response.json() as Promise<T>;
}

export const publicAPI = {
  feeds: (signal?: AbortSignal) =>
    read<{ data: PublicFeed[] }>("/feeds", signal),
  items: (feedId: number, cursor: string | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: "30" });
    if (feedId) params.set("feed_id", String(feedId));
    if (cursor) params.set("before", cursor);
    return read<PublicItemPage>(`/items?${params}`, signal);
  },
  item: (id: number, signal?: AbortSignal) =>
    read<{ data: PublicItem }>(`/items/${id}`, signal),
};
