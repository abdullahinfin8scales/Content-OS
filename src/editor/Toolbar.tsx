import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { useRef } from 'react';
import { MOD } from '../components/sidebar/Sidebar';
import { cx, IconButton } from '../components/ui/Button';
import { openMenu } from '../state/feedback';
import { IMAGE_TYPES, insertImages } from './extensions';

type Block = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'code';

const BLOCK_LABEL: Record<Block, string> = {
  p: 'Text',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  quote: 'Quote',
  code: 'Code',
};

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />;
}

export function Toolbar({ editor, onLink, subtle }: { editor: Editor; onLink: (anchor: HTMLElement) => void; subtle?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const block: Block = e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : e.isActive('codeBlock')
              ? 'code'
              : e.isActive('blockquote')
                ? 'quote'
                : 'p';
      return {
        block,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        highlight: e.isActive('highlight'),
        code: e.isActive('code'),
        link: e.isActive('link'),
        align: e.isActive({ textAlign: 'center' }) ? 'center' : e.isActive({ textAlign: 'right' }) ? 'right' : 'left',
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        task: e.isActive('taskList'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  const chain = () => editor.chain().focus();

  const setBlock = (block: Block) => {
    const c = chain();
    if (block === 'p') c.setParagraph().run();
    else if (block === 'quote') c.setParagraph().toggleBlockquote().run();
    else if (block === 'code') c.toggleCodeBlock().run();
    else c.setHeading({ level: Number(block[1]) as 1 | 2 | 3 }).run();
  };

  return (
    <div
      data-print-hide
      className={cx(
        'flex h-11 shrink-0 items-center justify-center border-b border-line bg-canvas/80 backdrop-blur transition-opacity duration-300',
        subtle && 'opacity-0 hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <div className="scroll-fade-x flex max-w-full items-center overflow-x-auto px-3 [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Formatting">
        <IconButton label="Undo" shortcut={`${MOD} Z`} size="sm" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo" shortcut={`${MOD} ⇧ Z`} size="sm" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 size={15} />
        </IconButton>
        <Divider />
        <button
          className="flex h-7 w-[112px] shrink-0 items-center justify-between gap-1 rounded-lg px-2 text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg"
          onClick={(e) =>
            openMenu(
              e.currentTarget,
              (Object.keys(BLOCK_LABEL) as Block[]).map((b) => ({
                label: BLOCK_LABEL[b],
                checked: s.block === b,
                onSelect: () => setBlock(b),
              })),
            )
          }
        >
          {BLOCK_LABEL[s.block]}
          <ChevronDown size={13} className="text-fg-4" />
        </button>
        <Divider />
        <IconButton label="Bold" shortcut={`${MOD} B`} size="sm" active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold size={15} strokeWidth={2.4} />
        </IconButton>
        <IconButton label="Italic" shortcut={`${MOD} I`} size="sm" active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic size={15} />
        </IconButton>
        <IconButton label="Underline" shortcut={`${MOD} U`} size="sm" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline size={15} />
        </IconButton>
        <IconButton label="Strikethrough" size="sm" active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough size={15} />
        </IconButton>
        <IconButton label="Highlight" size="sm" active={s.highlight} onClick={() => chain().toggleHighlight().run()}>
          <Highlighter size={15} />
        </IconButton>
        <IconButton label="Inline code" size="sm" active={s.code} onClick={() => chain().toggleCode().run()}>
          <Code size={15} />
        </IconButton>
        <IconButton label="Link" shortcut={`${MOD} K`} size="sm" active={s.link} onClick={(e) => onLink(e.currentTarget)}>
          <Link size={15} />
        </IconButton>
        <Divider />
        <IconButton label="Align left" size="sm" active={s.align === 'left'} onClick={() => chain().setTextAlign('left').run()}>
          <AlignLeft size={15} />
        </IconButton>
        <IconButton label="Align center" size="sm" active={s.align === 'center'} onClick={() => chain().setTextAlign('center').run()}>
          <AlignCenter size={15} />
        </IconButton>
        <IconButton label="Align right" size="sm" active={s.align === 'right'} onClick={() => chain().setTextAlign('right').run()}>
          <AlignRight size={15} />
        </IconButton>
        <Divider />
        <IconButton label="Bulleted list" size="sm" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List size={15} />
        </IconButton>
        <IconButton label="Numbered list" size="sm" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </IconButton>
        <IconButton label="Checklist" size="sm" active={s.task} onClick={() => chain().toggleTaskList().run()}>
          <ListTodo size={15} />
        </IconButton>
        <IconButton label="Quote" size="sm" active={s.block === 'quote'} onClick={() => chain().toggleBlockquote().run()}>
          <Quote size={15} />
        </IconButton>
        <IconButton label="Divider" size="sm" onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={15} />
        </IconButton>
        <IconButton label="Image" size="sm" onClick={() => fileInput.current?.click()}>
          <ImagePlus size={15} />
        </IconButton>
        <Divider />
        <IconButton label="Clear formatting" size="sm" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting size={15} />
        </IconButton>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void insertImages(editor, files);
          }}
        />
      </div>
    </div>
  );
}
