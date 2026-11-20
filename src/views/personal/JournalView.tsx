import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Lightbulb, PenLine, Trophy } from 'lucide-react';
import { PageHeader, TopBar } from '../../components/TopBar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatLongDate, parseISODate } from '../../lib/dates';
import { relativeDayName } from '../../lib/personalText';
import { paths } from '../../lib/router';
import { focusDay, useToday } from '../../state/personal';
import { db } from '../../state/repo';
import { Page } from './parts';

export function JournalView() {
  const today = useToday();
  const entries = useLiveQuery(
    async () => (await db.journal.toArray()).filter((e) => e.wordCount > 0 || !!e.wins?.length || !!e.losses?.length).sort((a, b) => (a.id < b.id ? 1 : -1)),
    [],
  );
  const wroteToday = entries?.some((e) => e.id === today);

  return (
    <>
      <TopBar crumbs={[{ label: 'Journal', icon: <BookOpen size={14} /> }]} />
      <Page>
        <PageHeader
          eyebrow="Thoughts of the day"
          title="Journal"
          meta={entries?.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : undefined}
          actions={
            <Button variant="primary" icon={<PenLine size={15} />} onClick={() => focusDay('journal')}>
              {wroteToday ? 'Continue today' : 'Write today'}
            </Button>
          }
        />
        {entries && entries.length === 0 ? (
          <EmptyState
            compact
            icon={<BookOpen size={26} />}
            title="No entries yet"
            body="Write your wins, losses and a few lines at the bottom of Today. Each day is kept here, by date."
          />
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {entries?.map((e) => {
              const wins = e.wins?.length ?? 0;
              const losses = e.losses?.length ?? 0;
              const meta = [
                relativeDayName(e.id, today),
                wins ? `${wins} win${wins === 1 ? '' : 's'}` : null,
                losses ? `${losses} loss${losses === 1 ? '' : 'es'}` : null,
                e.wordCount ? `${e.wordCount} word${e.wordCount === 1 ? '' : 's'}` : null,
              ].filter(Boolean);
              const lessons = (e.losses ?? []).filter((l) => l.lesson);
              return (
                <a key={e.id} href={e.id === today ? paths.home() : paths.day(e.id)} className="group block px-1 py-4 transition-colors hover:bg-hover">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14.5px] font-medium text-fg">{formatLongDate(parseISODate(e.id))}</span>
                    <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{meta.join(' · ')}</span>
                  </div>
                  {e.excerpt && <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-fg-3">{e.excerpt}</p>}
                  {wins > 0 && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-relaxed text-fg">
                      <Trophy size={12} className="mt-[4px] shrink-0 text-fg-3" />
                      <span className="line-clamp-2">{e.wins!.map((w) => w.text).join(' · ')}</span>
                    </p>
                  )}
                  {lessons.length > 0 && (
                    <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-relaxed text-fg">
                      <Lightbulb size={12} className="mt-[4px] shrink-0 text-fg-3" />
                      <span className="line-clamp-2">{lessons.map((l) => l.lesson).join(' · ')}</span>
                    </p>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
