import { ArrowUpRight, ChevronDown, FolderInput, Pin, PinOff, Plus, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { locationLabel } from '../components/docs/DocItems';
import { PlatformIcon, StatusDot } from '../components/ui/Badges';
import { Button, cx, IconButton } from '../components/ui/Button';
import { formatDuration, spokenSeconds } from '../lib/content';
import { formatRelative, todayISO } from '../lib/dates';
import { METRIC_LABELS, STATUS_META } from '../lib/meta';
import { platformInfo } from '../lib/platforms';
import { METRIC_KEYS, STATUSES, type Doc, type DocFont, type DocPatch, type MetricKey } from '../lib/types';
import { openMenu } from '../state/feedback';
import { repo } from '../state/repo';
import { useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import type { Workspace } from '../state/workspace';
import { normalizeUrl } from './LinkPopover';

export interface LiveStats {
  words: number;
  chars: number;
  selWords: number;
  selChars: number;
}

function Section({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="label-display">{label}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid rounded-[10px] border border-line bg-sunken p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'h-7 rounded-lg text-[12.5px] font-medium transition-colors',
            value === o.value ? 'bg-raised text-fg shadow-[0_1px_2px_rgb(0_0_0/0.25)] ring-1 ring-line-strong' : 'text-fg-3 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function DetailsPanel({ doc, ws, stats, onClose }: { doc: Doc; ws: Workspace; stats: LiveStats; onClose: () => void }) {
  const wpm = useSettings((s) => s.wpm);
  const update = (patch: DocPatch) => void repo.updateDoc(doc.id, patch);
  const isContent = doc.kind === 'content';
  const hasSelection = stats.selChars > 0;
  const chars = hasSelection ? stats.selChars : stats.chars;
  // Length meters for the selected platforms that have a known limit.
  const limited = doc.platforms.map((p) => platformInfo(ws.platforms, p)).filter((p) => p.limit !== null);

  return (
    <aside
      data-print-hide
      className="flex h-full w-[320px] shrink-0 flex-col border-l border-line bg-frame/60 max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:bg-frame max-xl:shadow-pop max-xl:animate-fade"
      aria-label="Document details"
    >
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line pr-2.5 pl-5">
        <span className="text-[13px] font-semibold text-fg">Details</span>
        <IconButton label="Close details" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section label="Type">
          <Segmented
            value={doc.kind}
            options={[
              { value: 'content', label: 'Content piece' },
              { value: 'note', label: 'Note' },
            ]}
            onChange={(kind) => update({ kind })}
          />
          <p className="mt-2 text-[12px] leading-relaxed text-fg-4">
            {isContent ? 'Tracked in the Pipeline and Calendar.' : 'Reference material — kept out of the Pipeline.'}
          </p>
        </Section>

        {isContent && (
          <>
            <Section label="Status">
              <button
                className="flex h-9 w-full items-center gap-2.5 rounded-[10px] border border-line bg-sunken px-3 text-left text-[13px] transition-colors hover:border-line-strong"
                onClick={(e) =>
                  openMenu(
                    e.currentTarget,
                    STATUSES.map((s) => ({
                      label: STATUS_META[s].label,
                      icon: <StatusDot status={s} className="shadow-none!" />,
                      checked: doc.status === s,
                      onSelect: () => update(s === 'posted' && !doc.publishDate ? { status: s, publishDate: todayISO() } : { status: s }),
                    })),
                    { minWidth: 260 },
                  )
                }
              >
                <StatusDot status={doc.status} />
                <span className="font-medium text-fg">{STATUS_META[doc.status].label}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-4">{STATUS_META[doc.status].hint}</span>
                <ChevronDown size={14} className="text-fg-4" />
              </button>
            </Section>

            <Section label="Platforms">
              <div className="grid grid-cols-7 gap-1.5">
                {ws.platforms.list.map(({ id, name }) => {
                  const on = doc.platforms.includes(id);
                  return (
                    <button
                      key={id}
                      aria-pressed={on}
                      aria-label={name}
                      data-tip={name}
                      onClick={() => update({ platforms: on ? doc.platforms.filter((x) => x !== id) : [...doc.platforms, id] })}
                      className={cx(
                        'flex aspect-square items-center justify-center rounded-[10px] border transition-all',
                        on ? 'border-fg-3 bg-active text-fg' : 'border-line text-fg-4 hover:border-line-strong hover:text-fg-2',
                      )}
                    >
                      <PlatformIcon platform={id} size={15} />
                    </button>
                  );
                })}
                <button
                  aria-label="Add a platform"
                  data-tip="Add a platform"
                  onClick={() => useUI.getState().set({ addPlatform: { docId: doc.id } })}
                  className="flex aspect-square items-center justify-center rounded-[10px] border border-dashed border-line-strong text-fg-4 transition-colors hover:border-fg-3 hover:text-fg"
                >
                  <Plus size={15} />
                </button>
              </div>
            </Section>

            <Section label={doc.status === 'posted' ? 'Posted on' : 'Publish date'}>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={doc.publishDate ?? ''}
                  onChange={(e) => update({ publishDate: e.target.value || null })}
                  className="field min-w-0 flex-1 text-[13px]"
                  aria-label="Publish date"
                />
                <input
                  type="time"
                  value={doc.publishTime ?? ''}
                  onChange={(e) => update({ publishTime: e.target.value || null })}
                  className="field w-[122px] text-[13px]"
                  aria-label="Publish time"
                />
              </div>
              {doc.publishDate && doc.status !== 'scheduled' && doc.status !== 'posted' && (
                <button className="mt-2 text-[12px] text-fg-3 underline-offset-2 hover:text-fg hover:underline" onClick={() => update({ status: 'scheduled' })}>
                  Mark as scheduled
                </button>
              )}
            </Section>

            <Section label="Post link">
              <UrlField value={doc.postUrl} onCommit={(postUrl) => update({ postUrl })} />
            </Section>
          </>
        )}

        <Section label="Tags">
          <TagEditor tags={doc.tags} suggestions={ws.allTags} onChange={(tags) => update({ tags })} />
        </Section>

        {isContent && (doc.status === 'posted' || Object.keys(doc.metrics).length > 0) && (
          <Section label="Performance" aside={<Engagement doc={doc} />}>
            <div className="grid grid-cols-2 gap-2">
              {METRIC_KEYS.map((k) => (
                <MetricField key={k} metric={k} value={doc.metrics[k]} onCommit={(v) => update({ metrics: withMetric(doc.metrics, k, v) })} />
              ))}
            </div>
          </Section>
        )}

        <Section label="Length" aside={hasSelection ? <span className="text-[11px] text-fg-3">Selection</span> : undefined}>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={(hasSelection ? stats.selWords : stats.words).toLocaleString()} label="Words" />
            <Stat value={chars.toLocaleString()} label="Characters" />
            <Stat value={formatDuration(spokenSeconds(hasSelection ? stats.selWords : stats.words, wpm))} label="Spoken" />
          </div>
          {isContent && limited.length > 0 && (
            <div className="mt-4 space-y-2.5">
              {limited.map((meta) => {
                const p = meta.id;
                const limit = meta.limit!;
                const ratio = chars / limit;
                const over = ratio > 1;
                return (
                  <div key={p}>
                    <div className="mb-1 flex items-center gap-2 text-[12px]">
                      <PlatformIcon platform={p} size={12} className="text-fg-3" />
                      <span className="text-fg-2">
                        {meta.name} <span className="text-fg-4">{meta.limitLabel}</span>
                      </span>
                      <span className={cx('ml-auto tabular-nums', over ? 'font-semibold text-danger' : 'text-fg-3')}>
                        {chars.toLocaleString()} / {limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-active">
                      <div
                        className={cx('h-full rounded-full transition-[width] duration-300', over ? 'bg-danger' : ratio > 0.9 ? 'bg-[var(--st-drafting)]' : 'bg-fg-2')}
                        style={{ width: `${Math.min(100, ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-[11.5px] leading-relaxed text-fg-4">Select part of the text — say, just the caption — to check that part alone.</p>
            </div>
          )}
        </Section>

        <Section label="Document">
          <div className="mb-3">
            <Segmented<DocFont>
              value={doc.font}
              options={[
                { value: 'sans', label: 'Sans' },
                { value: 'serif', label: 'Serif' },
                { value: 'mono', label: 'Mono' },
              ]}
              onChange={(font) => update({ font })}
            />
          </div>
          <div className="space-y-2 text-[12.5px]">
            <Row label="Location">
              <button
                className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-right text-fg-2 hover:bg-hover hover:text-fg"
                onClick={() => useUI.getState().set({ moveItem: { kind: 'doc', id: doc.id } })}
              >
                <span className="truncate">{locationLabel(ws, doc)}</span>
                <FolderInput size={13} className="shrink-0 text-fg-4" />
              </button>
            </Row>
            <Row label="Created">{new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Row>
            <Row label="Edited">{formatRelative(doc.updatedAt)}</Row>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-3 -ml-2"
            icon={doc.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            onClick={() => update({ pinned: !doc.pinned })}
          >
            {doc.pinned ? 'Unpin from Home' : 'Pin to Home'}
          </Button>
        </Section>
      </div>
    </aside>
  );
}

function withMetric(metrics: Doc['metrics'], key: MetricKey, value: number | undefined): Doc['metrics'] {
  const next = { ...metrics };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-fg-4">{label}</span>
      <span className="flex min-w-0 justify-end text-fg-2">{children}</span>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-sunken px-2.5 py-2">
      <div className="text-[15px] font-semibold text-fg tabular-nums">{value}</div>
      <div className="text-[11px] text-fg-4">{label}</div>
    </div>
  );
}

function Engagement({ doc }: { doc: Doc }) {
  const { views, likes = 0, comments = 0, shares = 0, saves = 0 } = doc.metrics;
  if (!views) return null;
  const rate = ((likes + comments + shares + saves) / views) * 100;
  return (
    <span className="text-[11.5px] text-fg-3" data-tip="(likes + comments + shares + saves) ÷ views">
      {rate.toFixed(rate < 10 ? 1 : 0)}% engagement
    </span>
  );
}

function UrlField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim() ? normalizeUrl(draft) : '';
    if (next !== value) onCommit(next);
    setDraft(next);
  };
  return (
    <div className="flex gap-2">
      <input
        type="url"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        placeholder="Link to the live post"
        className="field min-w-0 flex-1 text-[13px]"
      />
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open post"
          data-tip="Open post"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
        >
          <ArrowUpRight size={15} />
        </a>
      )}
    </div>
  );
}

function MetricField({ metric, value, onCommit }: { metric: MetricKey; value: number | undefined; onCommit: (v: number | undefined) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value === undefined ? '' : String(value));
  }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const cleaned = draft.replace(/[,\s]/g, '').toLowerCase();
    if (!cleaned) {
      if (value !== undefined) onCommit(undefined);
      return;
    }
    const m = cleaned.match(/^(\d+(?:\.\d+)?)([km]?)$/);
    if (!m) {
      setDraft(value === undefined ? '' : String(value));
      return;
    }
    const n = Math.round(parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1));
    if (n !== value) onCommit(n);
  };
  return (
    <label className="block rounded-[10px] border border-line bg-sunken px-2.5 py-1.5 transition-colors focus-within:border-fg-3 hover:border-line-strong">
      <span className="block text-[11px] text-fg-4">{METRIC_LABELS[metric]}</span>
      <input
        inputMode="decimal"
        value={focused ? draft : value === undefined ? '' : compact.format(value)}
        onFocus={() => {
          setFocused(true);
          setDraft(value === undefined ? '' : String(value));
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        placeholder="—"
        className="w-full bg-transparent text-[14px] font-semibold text-fg tabular-nums outline-none placeholder:text-fg-4"
      />
    </label>
  );
}

function TagEditor({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const tag = raw.replace(/^#/, '').trim();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-sunken pr-1 pl-2 text-[12.5px] text-fg-2">
          #{t}
          <button aria-label={`Remove ${t}`} className="rounded p-0.5 text-fg-4 hover:bg-hover hover:text-fg" onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <label className="relative flex h-7 min-w-[110px] flex-1 items-center">
        <Plus size={13} className="pointer-events-none absolute left-2 text-fg-4" />
        <input
          value={draft}
          list="infin8-tags"
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(',')) {
              add(v.slice(0, -1));
              setDraft('');
            } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
              setDraft('');
            } else if (e.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft);
            setDraft('');
          }}
          placeholder="Add tag"
          className="h-7 w-full rounded-lg bg-transparent pr-2 pl-6 text-[12.5px] text-fg outline-none placeholder:text-fg-4 focus:bg-sunken"
        />
        <datalist id="infin8-tags">
          {suggestions
            .filter((s) => !tags.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </label>
    </div>
  );
}
