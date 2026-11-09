import { Extension, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Image from '@tiptap/extension-image';
import FileHandler from '@tiptap/extension-file-handler';
import { toast } from '../state/feedback';
import { fileToDataUrl } from './images';

/**
 * Template "ghost hints": a `hint` attribute on paragraphs, shown as faint
 * placeholder text while the paragraph is empty. Never part of the content.
 */
const ParagraphHint = Extension.create({
  name: 'paragraphHint',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          hint: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-hint'),
            renderHTML: (attrs) => (attrs.hint ? { 'data-hint': attrs.hint } : {}),
          },
        },
      },
    ];
  },
});

/** Editor-level shortcuts that need app context. */
function AppShortcuts(handlers: { onLink: () => boolean; onSave: () => boolean }) {
  return Extension.create({
    name: 'appShortcuts',
    addKeyboardShortcuts() {
      return {
        'Mod-k': () => handlers.onLink(),
        'Mod-s': () => handlers.onSave(),
      };
    },
  });
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

async function insertImages(editor: Editor, files: File[], pos?: number) {
  for (const file of files) {
    try {
      const src = await fileToDataUrl(file);
      const node = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } };
      if (pos === undefined) editor.chain().focus().insertContent(node).run();
      else editor.chain().focus().insertContentAt(pos, node).run();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add that image', { tone: 'error' });
    }
  }
}

export function buildExtensions(handlers: { onLink: () => boolean; onSave: () => boolean }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      dropcursor: { color: 'var(--fg-2)', width: 2 },
    }),
    ParagraphHint,
    Placeholder.configure({
      showOnlyCurrent: false,
      includeChildren: true,
      placeholder: ({ editor, node }) => {
        if (node.type.name === 'paragraph' && typeof node.attrs.hint === 'string' && node.attrs.hint) return node.attrs.hint;
        if (editor.isEmpty) return 'Start writing…';
        if (node.type.name === 'heading') return 'Heading';
        return '';
      },
    }),
    Highlight,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography.configure({
      copyright: false,
      trademark: false,
      servicemark: false,
      registeredTrademark: false,
      oneHalf: false,
      oneQuarter: false,
      threeQuarters: false,
      plusMinus: false,
      notEqual: false,
      laquo: false,
      raquo: false,
      multiplication: false,
      superscriptTwo: false,
      superscriptThree: false,
    }),
    Image.configure({ allowBase64: true, inline: false }),
    FileHandler.configure({
      allowedMimeTypes: IMAGE_TYPES,
      onPaste: (editor, files) => void insertImages(editor, files),
      onDrop: (editor, files, pos) => void insertImages(editor, files, pos),
    }),
    AppShortcuts(handlers),
  ];
}

export { IMAGE_TYPES, insertImages };
