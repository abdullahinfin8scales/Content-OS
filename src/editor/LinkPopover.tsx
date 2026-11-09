import type { Editor } from '@tiptap/react';
import { ExternalLink, Unlink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from '../components/ui/Button';

export function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(value)) return `mailto:${value}`;
  return `https://${value.replace(/^\/\//, '')}`;
}

export function LinkPopover({ editor, at, onClose }: { editor: Editor; at: { left: number; top: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
  const [value, setValue] = useState(existing);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  const apply = () => {
    const href = normalizeUrl(value);
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) {
      chain.unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: value.trim(), marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    onClose();
  };

  const left = Math.min(Math.max(12, at.left), window.innerWidth - 352);
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[75] flex w-[340px] items-center gap-1.5 rounded-xl border border-line-strong bg-overlay p-1.5 shadow-pop animate-pop"
      style={{ left, top: at.top }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste or type a link"
        className="field h-8! flex-1 text-[13px]"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            editor.commands.focus();
          }
        }}
      />
      {existing && (
        <>
          <a
            href={existing}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open link"
            data-tip="Open link"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-hover hover:text-fg"
          >
            <ExternalLink size={14} />
          </a>
          <IconButton
            label="Remove link"
            size="sm"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onClose();
            }}
          >
            <Unlink size={14} />
          </IconButton>
        </>
      )}
      <Button size="sm" variant="primary" onClick={apply}>
        Apply
      </Button>
    </div>,
    document.body,
  );
}
