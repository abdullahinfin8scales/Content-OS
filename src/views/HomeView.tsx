import { ArrowRight, House, LayoutGrid, Pin, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Mark } from '../brand/Logo';
import { DocCard } from '../components/docs/DocItems';
import { TEMPLATE_ICONS } from '../components/icons';
import { TopBar } from '../components/TopBar';
import { PlatformStack, StatusDot } from '../components/ui/Badges';
import { Button, cx } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { addDays, formatDueLabel, formatLongDate, formatTime, greeting, parseISODate, toISODate, todayISO, weekStartsOn } from '../lib/dates';
import { IS_PREVIEW } from '../lib/env';
import { paths } from '../lib/router';
import { getTemplate } from '../lib/templates';
import type { Doc, Status } from '../lib/types';
import { createDocFromTemplate, defaultLocation, openNewDocDialog } from '../state/actions';
import { useBackup } from '../state/backup';
import { useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { useWorkspace, type Workspace } from '../state/workspace';

const QUICK = ['short-video', 'carousel', 'idea', 'log-post'] as const;

export function HomeView() {
  const ws = useWorkspace();
  const name = useSettings((s) => s.displayName.trim());
  const today = todayISO();

  const data = useMemo(() => {
    const content = ws.docs.filter((d) => d.kind === 'content');
    const by = (s: Status) => content.filter((d) => d.status === s);
    const monthAgo = toISODate(addDays(new Date(), -30));
    const upcoming = content
      .filter((d) => d.publishDate && d.publishDate >= today && d.status !== 'posted')
      .sort((a, b) => (a.publishDate! + (a.publishTime ?? '')).localeCompare(b.publishDate! + (b.publishTime ?? '')));
    const overdue = content.filter((d) => d.status === 'scheduled' && d.publishDate && d.publishDate < today);
    return {
      ideas: by('idea').length,
      inProgress: by('drafting').length + by('ready').length,
      scheduled: by('scheduled').length,
      posted30: content.filter((d) => d.status === 'posted' && d.publishDate && d.publishDate >= monthAgo).length,
      upcoming: upcoming.slice(0, 6),
      overdue,
      recent: ws.docs.filter((d) => !d.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
      pinned: ws.docs.filter((d) => d.pinned).sort((a, b) => b.updatedAt - a.updatedAt),
    };
  }, [ws, today]);

  const subtitle = [
    data.ideas && `${data.ideas} idea${data.ideas === 1 ? '' : 's'} waiting`,
    data.upcoming.length && `${data.upcoming.length} coming up`,
    data.posted30 && `${data.posted30} posted in the last 30 days`,
  ].filter(Boolean);

  const create = (templateId: string) => {
    const location = defaultLocation(ws);
    if (!location) {
      useUI.getState().set({ spaceDialog: {} });
      return;
    }
    void createDocFromTemplate(templateId, location, {}, ws);
  };

  return (
    <>
      <TopBar crumbs={[{ label: 'Home', icon: <House size={14} /> }]} />
      <div className="min-h-0 flex-1 overflow-y-auto canvas-glow">
        <div className="mx-auto w-full max-w-[1180px] px-4 pt-10 pb-24 sm:px-8 sm:pt-14">
          {/* Hero */}
          <section className="relative mb-10 overflow-hidden">
            <Mark className="pointer-events-none absolute -top-4 right-0 hidden h-[150px] w-auto text-fg opacity-[0.045] lg:block" />
            <div className="label-display mb-4">{formatLongDate(new Date())}</div>
            <h1 className="max-w-[760px] text-[34px] leading-[1.08] font-[700] tracking-[-0.035em] text-fg sm:text-[46px]">
              {greeting()}
              {name ? `, ${name}` : ''}.
            </h1>
            <p className="mt-3 text-[15px] text-fg-3">
              {subtitle.length ? subtitle.join(' · ') : 'A clean slate. What are you making today?'}
            </p>
          </section>

          <BackupNudge docCount={ws.docs.length} />

          {/* Quick create */}
          <section className="mb-10">
            <div className="mb-3 flex items-center justify-between">
              <span className="label-display">Start something</span>
              <button className="flex items-center gap-1.5 text-[12.5px] text-fg-3 hover:text-fg" onClick={() => openNewDocDialog()}>
                <LayoutGrid size={13} /> All templates
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {QUICK.map((id) => {
                const t = getTemplate(id);
                const Icon = TEMPLATE_ICONS[t.icon];
                return (
                  <button
                    key={id}
                    onClick={() => create(id)}
                    className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border border-line bg-raised p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand text-brand-fg">
                      <Icon size={17} />
                    </span>
                    <span>
                      <span className="block text-[14px] font-semibold text-fg">{t.name}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-fg-3">{t.description}</span>
                    </span>
                    <ArrowRight size={15} className="absolute top-4 right-4 text-fg-4 transition-transform group-hover:translate-x-0.5 group-hover:text-fg-2" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Stats */}
          <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Ideas" value={data.ideas} status="idea" href={paths.pipeline()} />
            <StatTile label="In progress" value={data.inProgress} status="drafting" href={paths.pipeline()} />
            <StatTile label="Scheduled" value={data.scheduled} status="scheduled" href={paths.calendar()} />
            <StatTile label="Posted · 30 days" value={data.posted30} status="posted" href={paths.calendar()} />
          </section>

          {data.pinned.length > 0 && (
            <section className="mb-10">
              <div className="label-display mb-3 flex items-center gap-1.5">
                <Pin size={11} /> Pinned
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.pinned.slice(0, 6).map((d) => (
                  <DocCard key={d.id} doc={d} ws={ws} />
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section>
              <div className="label-display mb-3">Continue writing</div>
              {data.recent.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.recent.map((d) => (
                    <DocCard key={d.id} doc={d} ws={ws} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line-strong">
                  <EmptyState compact title="Nothing written yet" body="Pick a template above to start your first piece." />
                </div>
              )}
            </section>
            <section>
              <div className="label-display mb-3">Up next</div>
              <UpNext docs={data.upcoming} overdue={data.overdue} />
              <div className="mt-8">
                <div className="label-display mb-3">Posting activity</div>
                <Activity ws={ws} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function StatTile({ label, value, status, href }: { label: string; value: number; status: Status; href: string }) {
  return (
    <a href={href} className="group relative overflow-hidden rounded-2xl border border-line bg-raised p-4 shadow-card transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
        <StatusDot status={status} />
        {label}
      </div>
      <div className="mt-3 text-[32px] leading-none font-[650] tracking-[-0.03em] text-fg tabular-nums">{value}</div>
      <span
        aria-hidden
        className="absolute -right-6 -bottom-10 h-24 w-24 rounded-full opacity-[0.08] blur-2xl transition-opacity group-hover:opacity-[0.16]"
        style={{ background: `var(--st-${status})` }}
      />
    </a>
  );
}

function UpNext({ docs, overdue }: { docs: Doc[]; overdue: Doc[] }) {
  if (!docs.length && !overdue.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-5 py-6 text-[13px] leading-relaxed text-fg-3">
        Nothing scheduled. Give a post a publish date in its Details panel, or drag it onto the{' '}
        <a href={paths.calendar()} className="text-fg underline underline-offset-2">
          Calendar
        </a>
        .
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
      {overdue.length > 0 && (
        <a href={paths.calendar()} className="flex items-center gap-2 border-b border-line bg-danger/10 px-4 py-2.5 text-[12.5px] text-danger">
          {overdue.length} scheduled post{overdue.length === 1 ? ' is' : 's are'} past due — mark as posted or reschedule
        </a>
      )}
      {docs.map((d) => {
        const date = parseISODate(d.publishDate!);
        return (
          <a key={d.id} href={paths.doc(d.id)} className="flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-hover">
            <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border border-line bg-sunken py-1">
              <span className="text-[9.5px] font-semibold tracking-wider text-fg-4 uppercase">{date.toLocaleDateString(undefined, { month: 'short' })}</span>
              <span className="text-[15px] leading-tight font-semibold text-fg">{date.getDate()}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-fg">{d.title || 'Untitled'}</span>
              <span className="flex items-center gap-2 text-[12px] text-fg-4">
                <StatusDot status={d.status} className="h-1.5! w-1.5! shadow-none!" />
                {formatDueLabel(d.publishDate!)}
                {d.publishTime && ` · ${formatTime(d.publishTime)}`}
              </span>
            </span>
            <PlatformStack platforms={d.platforms} size={12} max={3} />
          </a>
        );
      })}
    </div>
  );
}

const WEEKS = 18;

function Activity({ ws }: { ws: Workspace }) {
  const { weeks, total, streak, max } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of ws.docs) if (d.kind === 'content' && d.status === 'posted' && d.publishDate) counts.set(d.publishDate, (counts.get(d.publishDate) ?? 0) + 1);
    const start = weekStartsOn();
    const now = new Date();
    const offset = (now.getDay() - start + 7) % 7;
    const firstDay = addDays(now, -offset - (WEEKS - 1) * 7);
    const weeks: { iso: string; count: number; future: boolean }[][] = [];
    let total = 0;
    let max = 0;
    const todayIso = toISODate(now);
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const iso = toISODate(addDays(firstDay, w * 7 + d));
        const count = counts.get(iso) ?? 0;
        total += count;
        max = Math.max(max, count);
        col.push({ iso, count, future: iso > todayIso });
      }
      weeks.push(col);
    }
    // Consecutive weeks (ending this week or last) with at least one post.
    let streak = 0;
    for (let w = WEEKS - 1; w >= 0; w--) {
      const has = weeks[w].some((c) => c.count > 0);
      if (has) streak++;
      else if (w === WEEKS - 1) continue;
      else break;
    }
    return { weeks, total, streak, max };
  }, [ws]);

  const level = (n: number) => (n === 0 ? 0 : max <= 1 ? 4 : Math.min(4, Math.ceil((n / max) * 4)));
  const shades = ['var(--active)', 'color-mix(in oklab, var(--fg) 28%, transparent)', 'color-mix(in oklab, var(--fg) 48%, transparent)', 'color-mix(in oklab, var(--fg) 72%, transparent)', 'var(--fg)'];

  return (
    <div className="rounded-2xl border border-line bg-raised p-4 shadow-card">
      <div className="flex gap-[3px] overflow-hidden">
        {weeks.map((col, i) => (
          <div key={i} className="flex flex-1 flex-col gap-[3px]">
            {col.map((c) => (
              <span
                key={c.iso}
                data-tip={`${c.count} post${c.count === 1 ? '' : 's'} · ${parseISODate(c.iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                className={cx('aspect-square w-full rounded-[3px]', c.future && 'opacity-30')}
                style={{ background: shades[level(c.count)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px] text-fg-3">
        <span>
          <span className="font-semibold text-fg">{total}</span> posted in {WEEKS} weeks
        </span>
        <span>
          {streak > 0 ? (
            <>
              <span className="font-semibold text-fg">{streak}</span>-week streak
            </>
          ) : (
            'Log posts to build a streak'
          )}
        </span>
      </div>
    </div>
  );
}


const DAY = 86_400_000;

/** Shown when posts exist but nothing has been backed up for a week. */
function BackupNudge({ docCount }: { docCount: number }) {
  const status = useBackup((st) => st.status);
  const lastBackupAt = useSettings((st) => st.lastBackupAt);
  const dismissedAt = useSettings((st) => st.backupNudgeDismissedAt);
  const set = useSettings((st) => st.set);
  const now = Date.now();
  const due =
    !IS_PREVIEW &&
    status !== 'active' &&
    docCount >= 3 &&
    (!lastBackupAt || now - lastBackupAt > 7 * DAY) &&
    (!dismissedAt || now - dismissedAt > 3 * DAY);
  if (!due) return null;
  return (
    <section
      className="mb-10 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center"
      style={{
        borderColor: 'color-mix(in oklab, var(--st-drafting) 35%, transparent)',
        background: 'color-mix(in oklab, var(--st-drafting) 7%, var(--raised))',
      }}
    >
      <ShieldAlert size={20} className="shrink-0 text-[var(--st-drafting)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-fg">{lastBackupAt ? 'Your last backup is over a week old' : 'Your posts aren’t backed up yet'}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3">
          They live only in this browser. Turn on automatic backup so clearing your browser, or losing this laptop, can’t take them with it.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" onClick={() => set({ backupNudgeDismissedAt: Date.now() })}>
          Not now
        </Button>
        <Button variant="primary" size="sm" onClick={() => useUI.getState().set({ settingsOpen: true })}>
          Set up backup
        </Button>
      </div>
    </section>
  );
}
