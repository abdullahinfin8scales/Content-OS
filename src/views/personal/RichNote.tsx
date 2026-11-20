import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../components/ui/Button';
import { buildExtensions } from '../../editor/extensions';
import { LinkPopover } from '../../editor/LinkPopover';
import { Toolbar } from '../../editor/Toolbar';
import { toPlainText } from '../../lib/content';
import { SAVE_EVENT } from '../../lib/events';
import type { RichNode } from '../../lib/types';
import { toast } from '../../state/feedback';

/**
 * A slim rich-text editor for the journal and notes: the document editor's
 * extensions and toolbar, without templates, platforms or the teleprompter.
 * Saves 700 ms after typing stops, on leave, on tab hide and on ⌘S.
 */
export function RichNote({
  initial,
  onSave,
  placeholder,
  compact,
  page,
  header,
  label,
  editorRef: outerRef,
}: {
  initial: RichNode | undefined;
  onSave: (json: RichNode) => Promise<void>;
  placeholder?: string;
  compact?: boolean;
  /** Full page: toolbar on top, then a scrolling column holding `header` and the text. */
  page?: boolean;
  header?: ReactNode;
  label: string;
  editorRef?: (editor: Editor | null) => void;
}) {
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const [linkAt, setLinkAt] = useState<{ left: number; top: number } | null>(null);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const editor = editorRef.current;
    if (!pending.current || !editor) return;
    pending.current = false;
    try {
      await saveRef.current(editor.getJSON() as RichNode);
    } catch (err) {
      console.error(err);
      pending.current = true;
      toast('Couldn’t save — your browser storage may be full', { tone: 'error' });
    }
  }, []);

  const handlers = useRef<{ onLink: () => boolean; onSave: () => boolean }>({ onLink: () => false, onSave: () => false });
  handlers.current = {
    onLink: () => {
      const editor = editorRef.current;
      if (!editor || (editor.state.selection.empty && !editor.isActive('link'))) return false;
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      setLinkAt({ left: coords.left, top: coords.bottom + 8 });
      return true;
    },
    onSave: () => {
      void flush();
      return true;
    },
  };

  const extensions = useMemo(
    () => buildExtensions({ onLink: () => handlers.current.onLink(), onSave: () => handlers.current.onSave() }, { placeholder }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    extensions,
    content: initial ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { spellcheck: 'true', 'aria-label': label, class: 'ProseMirror' },
      clipboardTextSerializer: (slice) => toPlainText({ type: 'doc', content: slice.content.toJSON() ?? [] }),
    },
    onUpdate: () => {
      pending.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    outerRef?.(editor);
    return () => outerRef?.(null);
  }, [editor, outerRef]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onSave = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onSave);
    window.addEventListener(SAVE_EVENT, onSave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onSave);
      window.removeEventListener(SAVE_EVENT, onSave);
      void flush();
    };
  }, [flush]);

  if (!editor) return null;
  const body = (
    <div className={cx('prose-editor', compact && 'is-compact')} data-font="sans">
      <EditorContent editor={editor} />
    </div>
  );
  return (
    <>
      {page ? (
        <>
          <Toolbar
            editor={editor}
            onLink={(el) => {
              const r = el.getBoundingClientRect();
              setLinkAt({ left: r.left, top: r.bottom + 8 });
            }}
          />
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            onMouseDown={(e) => {
              // Clicking the empty space below the text puts the caret at the end.
              if (e.target === e.currentTarget) {
                e.preventDefault();
                editor.commands.focus('end');
              }
            }}
          >
            <div className="mx-auto w-full max-w-[760px] px-5 pt-10 sm:px-8 sm:pt-14">
              {header}
              {body}
            </div>
          </div>
        </>
      ) : (
        body
      )}
      {linkAt && <LinkPopover editor={editor} at={linkAt} onClose={() => setLinkAt(null)} />}
    </>
  );
}
