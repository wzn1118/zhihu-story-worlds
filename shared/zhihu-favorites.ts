/** OAuth favorites are transient selections. Only explicit imports become projects. */
export interface ZhihuFavoriteItem {
  id: string;
  title: string;
  author: string;
  summary: string;
  url: string;
  contentType: string;
  characters: number;
  importable: boolean;
  unavailableReason?: string;
}

export interface ZhihuFavoriteList {
  id: string;
  title: string;
  description: string;
  url: string;
}

export interface ZhihuFavoriteItemsResult {
  items: ZhihuFavoriteItem[];
  /** Available only for collection-folder pages, preserved as an int64 string. */
  nextOffset?: string;
}

export interface ZhihuFavoriteListsResult { lists: ZhihuFavoriteList[] }
