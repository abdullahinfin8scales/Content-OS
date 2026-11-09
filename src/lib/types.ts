export type ID = string;

export const STATUSES = ['idea', 'drafting', 'ready', 'scheduled', 'posted'] as const;
export type Status = (typeof STATUSES)[number];

export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'threads', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** `content` pieces flow through the pipeline/calendar; `note`s are reference docs. */
export type DocKind = 'content' | 'note';
export type DocFont = 'sans' | 'serif' | 'mono';

export const SPACE_COLORS = ['white', 'violet', 'blue', 'cyan', 'green', 'amber', 'orange', 'rose'] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];

/** Minimal structural type for rich-text JSON (compatible with TipTap's JSONContent). */
export interface RichMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface RichNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: RichMark[];
  text?: string;
}

export interface Trashable {
  deletedAt: number | null;
  /** The item whose deletion trashed this one (itself when deleted directly). */
  trashRootId: ID | null;
}

export interface Space extends Trashable {
  id: ID;
  name: string;
  icon: string;
  color: SpaceColor;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Folder extends Trashable {
  id: ID;
  spaceId: ID;
  parentId: ID | null;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Metrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
}
export const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export interface Doc extends Trashable {
  id: ID;
  spaceId: ID;
  folderId: ID | null;
  title: string;
  kind: DocKind;
  status: Status;
  platforms: Platform[];
  /** Local calendar date, YYYY-MM-DD. */
  publishDate: string | null;
  /** Local time, HH:MM. */
  publishTime: string | null;
  postUrl: string;
  tags: string[];
  metrics: Metrics;
  pinned: boolean;
  font: DocFont;
  excerpt: string;
  wordCount: number;
  charCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Rich content lives apart from metadata so list views stay light. */
export interface DocContent {
  id: ID;
  json: RichNode;
}

/** Plain text per doc, used for full-text search. */
export interface DocText {
  id: ID;
  text: string;
}

export type ItemKind = 'space' | 'folder' | 'doc';

export type DocPatch = Partial<
  Pick<
    Doc,
    | 'title'
    | 'kind'
    | 'status'
    | 'platforms'
    | 'publishDate'
    | 'publishTime'
    | 'postUrl'
    | 'tags'
    | 'metrics'
    | 'pinned'
    | 'font'
  >
>;
