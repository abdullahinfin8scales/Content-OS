import { useEffect, useState } from 'react';
import { SPACE_COLOR_VAR } from '../../lib/meta';
import { navigate, paths } from '../../lib/router';
import { SPACE_COLORS, type SpaceColor } from '../../lib/types';
import { createDocFromTemplate } from '../../state/actions';
import { toast } from '../../state/feedback';
import { repo } from '../../state/repo';
import { useUI } from '../../state/ui';
import { useWorkspace } from '../../state/workspace';
import { SPACE_ICONS } from '../icons';
import { SpaceGlyph } from '../ui/Badges';
import { Button, cx } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function SpaceDialog() {
  const ws = useWorkspace();
  const request = useUI((s) => s.spaceDialog);
  const set = useUI((s) => s.set);
  const editing = request?.editId ? ws.spaceById.get(request.editId) : undefined;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('sparkles');
  const [color, setColor] = useState<SpaceColor>('white');

  useEffect(() => {
    if (!request) return;
    setName(editing?.name ?? '');
    setIcon(editing?.icon ?? 'sparkles');
    setColor(editing?.color ?? 'white');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const close = () => set({ spaceDialog: null });

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return;
    if (editing) {
      await repo.updateSpace(editing.id, { name: clean, icon, color });
      close();
      return;
    }
    const space = await repo.createSpace({ name: clean, icon, color });
    useUI.getState().setExpanded(space.id, true);
    const then = request?.then;
    close();
    if (then) {
      void createDocFromTemplate(then.templateId, { spaceId: space.id, folderId: null }, then.overrides ?? {}, ws);
    } else {
      navigate(paths.space(space.id));
    }
    toast(`Space “${space.name}” created`);
  };

  return (
    <Modal
      open={!!request}
      onClose={close}
      title={editing ? 'Edit space' : 'New space'}
      description={
        editing
          ? undefined
          : request?.then
            ? 'Documents live inside spaces. Name your first one — a brand, a client or a channel — and your document opens right after.'
            : 'A space is a top-level area — a brand, a client, a channel or a campaign.'
      }
      width={480}
      labelledBy="space-dialog-title"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void submit()}>
            {editing ? 'Save' : request?.then ? 'Create and continue' : 'Create space'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5 px-6 pt-3 pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-3">
          <SpaceGlyph space={{ icon, color }} size="lg" />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Personal brand, Client — Acme, YouTube"
            className="field h-10! text-[14px]"
            aria-label="Space name"
            maxLength={60}
          />
        </div>
        <div>
          <div className="label-display mb-2.5">Color</div>
          <div className="flex flex-wrap gap-2">
            {SPACE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx('h-7 w-7 rounded-full transition-transform', color === c ? 'scale-110 ring-2 ring-fg ring-offset-2 ring-offset-[var(--overlay)]' : 'hover:scale-105')}
                style={{ background: SPACE_COLOR_VAR[c] }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="label-display mb-2.5">Icon</div>
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
            {Object.entries(SPACE_ICONS).map(([key, Icon]) => (
              <button
                type="button"
                key={key}
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cx(
                  'flex aspect-square items-center justify-center rounded-[10px] transition-colors',
                  icon === key ? 'bg-active text-fg ring-1 ring-fg-3' : 'text-fg-3 hover:bg-hover hover:text-fg',
                )}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
