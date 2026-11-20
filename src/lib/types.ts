export type ID = string;

export const STATUSES = ['idea', 'drafting', 'ready', 'scheduled', 'posted'] as const;
export type Status = (typeof STATUSES)[number];

/** Platforms that ship with the app. */
export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'threads', 'facebook'] as const;
export type BuiltinPlatform = (typeof PLATFORMS)[number];
/** A built-in platform (`instagram`) or a platform the user added (`custom-…`). */
export type Platform = string;

/** A platform logo: a brand glyph (24×24 SVG path) or a letter badge. */
export type PlatformIconData = { kind: 'path'; path: string; slug?: string; evenOdd?: boolean } | { kind: 'monogram'; text: string };

/** A social platform the user added from a link. */
export interface CustomPlatform {
  id: ID;
  name: string;
  url: string;
  domain: string;
  icon: PlatformIconData;
  /** Character limit for a post, if known. */
  limit: number | null;
  createdAt: number;
  updatedAt: number;
}

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
  /** `thread`: an ordered set of connected posts; it holds documents only. */
  kind?: 'thread';
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
  /** Order inside a thread (only meaningful when the folder is a thread). */
  position?: number;
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

/* ------------------------------------------------------------------ */
/* Personal: non-negotiables, day tasks, goals, journal, notes          */
/* ------------------------------------------------------------------ */

/** A daily commitment. It appears on each of its days' timelines at its time. */
export interface NonNegotiable {
  id: ID;
  title: string;
  /** Local time, HH:MM. */
  time: string;
  order: number;
  /** Taken off the daily list at this time; past days keep their copies. */
  archivedAt: number | null;
  /** Weekdays it is on (0 = Sunday … 6 = Saturday). Missing (older records) means every day. */
  days?: number[];
  /** Single dates it is off (YYYY-MM-DD), on top of the weekdays. Only today and later are kept. */
  offDates?: string[];
  createdAt: number;
  updatedAt: number;
}

/** One item on a day's list: the user's own task, or a day's copy of a non-negotiable. */
export interface Task {
  id: ID;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  title: string;
  /** Local time, HH:MM; null means "any time that day". */
  time: string | null;
  done: boolean;
  doneAt: number | null;
  goalId: ID | null;
  /** Set when this task is a day's copy of a non-negotiable. */
  nnId: ID | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export const GOAL_STATUSES = ['active', 'achieved', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** An optional number to reach, e.g. 10,000 followers. */
export interface GoalMeasure {
  current: number;
  target: number;
  unit: string;
}

export interface Goal {
  id: ID;
  title: string;
  /** Why this goal matters — shown as the reminder. */
  why: string;
  /** Local calendar dates, YYYY-MM-DD. */
  startDate: string;
  targetDate: string;
  status: GoalStatus;
  measure: GoalMeasure | null;
  createdAt: number;
  updatedAt: number;
}

/** Something that went well on a day. */
export interface DayWin {
  id: ID;
  text: string;
  createdAt: number;
}

/** Something that went wrong on a day, and what it taught. */
export interface DayLoss {
  id: ID;
  text: string;
  lesson: string;
  createdAt: number;
}

/**
 * One day's reflection. The id is the date, YYYY-MM-DD. Wins and losses live
 * here too (optional: older entries don't have them), so they sync as part of
 * the day's `journal` record without a new record kind.
 */
export interface JournalEntry {
  id: string;
  json: RichNode;
  excerpt: string;
  wordCount: number;
  wins?: DayWin[];
  losses?: DayLoss[];
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: ID;
  title: string;
  json: RichNode;
  excerpt: string;
  wordCount: number;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'time' | 'goalId' | 'date'>>;
export type GoalPatch = Partial<Pick<Goal, 'title' | 'why' | 'startDate' | 'targetDate' | 'status' | 'measure'>>;
