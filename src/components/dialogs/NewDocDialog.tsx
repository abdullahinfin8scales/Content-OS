import { useEffect, useMemo, useState } from 'react';
import { STATUS_META } from '../../lib/meta';
import { TEMPLATES } from '../../lib/templates';
import { createDocFromTemplate, defaultLocation } from '../../state/actions';
import { useUI } from '../../state/ui';
import { useWorkspace } from '../../state/workspace';
import { TEMPLATE_ICONS } from '../icons';
import { PlatformStack } from '../ui/Badges';
import { Button, cx } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { locationOptions, optionKey } from './locations';

export function NewDocDialog() {
  const ws = useWorkspace();
  const request = useUI((s) => s.newDoc);
  const set = useUI((s) => s.set);
  const [selected, setSelected] = useState(0);
  const [locationKey, setLocationKey] = useState('');
  const options = useMemo(() => locationOptions(ws), [ws]);

  useEffect(() => {
    if (!request) return;
    setSelected(request.status === 'idea' ? TEMPLATES.findIndex((t) => t.id === 'idea') : request.status === 'posted' ? TEMPLATES.findIndex((t) => t.id === 'log-post') : 0);
    const fallback = defaultLocation(ws);
    const loc = request.spaceId ? { spaceId: request.spaceId, folderId: request.folderId ?? null } : fallback;
    setLocationKey(loc ? optionKey(loc.spaceId, loc.folderId) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const close = () => set({ newDoc: null });
  const location = options.find((o) => o.key === locationKey) ?? options[0];

  const create = (index = selected) => {
    if (!location) {
      close();
      set({ spaceDialog: {} });
      return;
    }
    const template = TEMPLATES[index];
    const overrides = {
      ...(request?.status && template.kind === 'content' ? { status: request.status } : {}),
      ...(request?.publishDate && template.kind === 'content' ? { publishDate: request.publishDate } : {}),
    };
    close();
    void createDocFromTemplate(template.id, { spaceId: location.spaceId, folderId: location.folderId }, overrides, ws);
  };

  const cols = 3;

  return (
    <Modal
      open={!!request}
      onClose={close}
      title="New document"
      description={
        request?.status
          ? `Starts as ${STATUS_META[request.status].label.toLowerCase()}${request.publishDate ? ` on ${request.publishDate}` : ''}.`
          : 'Pick a starting point. Templates use faint hints that disappear as you write.'
      }
      width={760}
      labelledBy="new-doc-title"
      footer={
        <>
          <label className="mr-auto flex min-w-0 items-center gap-2 text-[12.5px] text-fg-3">
            <span className="shrink-0">Save in</span>
            <select
              value={location?.key ?? ''}
              onChange={(e) => setLocationKey(e.target.value)}
              className="field h-8! max-w-[300px] min-w-0 truncate pr-7! text-[12.5px]"
              aria-label="Location"
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {' '.repeat(o.depth)}
                  {o.depth ? '› ' : ''}
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => create()}>
            Create
          </Button>
        </>
      }
    >
      <div
        className="grid grid-cols-1 gap-2 px-6 pt-3 pb-5 sm:grid-cols-3"
        role="listbox"
        aria-label="Templates"
        onKeyDown={(e) => {
          const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
          if (move) {
            e.preventDefault();
            const next = Math.min(TEMPLATES.length - 1, Math.max(0, selected + move));
            setSelected(next);
            (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            create();
          }
        }}
      >
        {TEMPLATES.map((t, i) => {
          const Icon = TEMPLATE_ICONS[t.icon];
          const active = i === selected;
          return (
            <button
              key={t.id}
              role="option"
              aria-selected={active}
              data-autofocus={active ? true : undefined}
              onClick={() => setSelected(i)}
              onDoubleClick={() => create(i)}
              className={cx(
                'group flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition-all outline-none',
                active ? 'border-fg-3 bg-active' : 'border-line hover:border-line-strong hover:bg-hover',
              )}
            >
              <div className="flex w-full items-center gap-2">
                <span
                  className={cx(
                    'flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors',
                    active ? 'bg-brand text-brand-fg' : 'bg-sunken text-fg-2 ring-1 ring-line ring-inset',
                  )}
                >
                  <Icon size={16} />
                </span>
                <span className="flex-1" />
                <PlatformStack platforms={t.platforms} size={11} max={3} />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold text-fg">{t.name}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{t.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
