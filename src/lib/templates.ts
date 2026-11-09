import type { DocKind, Platform, RichNode, Status } from './types';

/* Small builders for rich-text JSON. `hint` renders as faint ghost text in the
   editor while the paragraph is empty, so templates guide without clutter. */
const text = (value: string): RichNode => ({ type: 'text', text: value });
const p = (value = '', hint?: string): RichNode => ({
  type: 'paragraph',
  ...(hint ? { attrs: { hint } } : {}),
  ...(value ? { content: [text(value)] } : {}),
});
const hint = (value: string) => p('', value);
const h = (level: 1 | 2 | 3, value: string): RichNode => ({ type: 'heading', attrs: { level }, content: [text(value)] });
const item = (child: RichNode): RichNode => ({ type: 'listItem', content: [child] });
const bullets = (...children: RichNode[]): RichNode => ({ type: 'bulletList', content: children.map(item) });
const tasks = (...children: RichNode[]): RichNode => ({
  type: 'taskList',
  content: children.map((child) => ({ type: 'taskItem', attrs: { checked: false }, content: [child] })),
});
const hr = (): RichNode => ({ type: 'horizontalRule' });
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content });
const bold = (value: string): RichNode => ({ type: 'text', text: value, marks: [{ type: 'bold' }] });
const rich = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });

export type TemplateIcon =
  | 'file'
  | 'clapperboard'
  | 'video'
  | 'layers'
  | 'briefcase'
  | 'thread'
  | 'lightbulb'
  | 'archive'
  | 'note';

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: TemplateIcon;
  kind: DocKind;
  status: Status;
  platforms: Platform[];
  /** Title prefilled for the new doc ('' leaves it empty). */
  title: string;
  /** When true the doc is dated today (useful for logging past posts). */
  datedToday?: boolean;
  build: () => RichNode;
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank document',
    description: 'Start from an empty page.',
    icon: 'file',
    kind: 'content',
    status: 'drafting',
    platforms: [],
    title: '',
    build: () => doc(p()),
  },
  {
    id: 'short-video',
    name: 'Short-form script',
    description: 'Reels, TikTok, Shorts — hook, value, payoff, CTA and a shot list.',
    icon: 'clapperboard',
    kind: 'content',
    status: 'drafting',
    platforms: ['instagram', 'tiktok', 'youtube'],
    title: '',
    build: () =>
      doc(
        h(2, 'Hook · 0–3s'),
        hint('The first line that stops the scroll — a bold claim, a question, or the result up front.'),
        h(2, 'Setup'),
        hint('Why should they care? Name the problem or the stakes in a line or two.'),
        h(2, 'Value'),
        bullets(hint('Point one'), hint('Point two'), hint('Point three')),
        h(2, 'Payoff'),
        hint('Deliver on the hook — the result, the “aha”, the proof.'),
        h(2, 'Call to action'),
        hint('Follow for part 2, comment a keyword, save this for later…'),
        hr(),
        h(3, 'Shot list'),
        tasks(hint('A-roll: talking head'), hint('B-roll'), hint('On-screen text')),
        h(3, 'Caption'),
        hint('Caption and hashtags'),
      ),
  },
  {
    id: 'long-video',
    name: 'Long-form video',
    description: 'YouTube outline — titles, thumbnail, hook, chapters, description.',
    icon: 'video',
    kind: 'content',
    status: 'drafting',
    platforms: ['youtube'],
    title: '',
    build: () =>
      doc(
        h(2, 'Title options'),
        bullets(hint('Title option A'), hint('Title option B'), hint('Title option C')),
        h(2, 'Thumbnail concept'),
        hint('The visual, the text overlay (four words max), the emotion.'),
        h(2, 'Hook · first 30 seconds'),
        hint('Open with the payoff or the tension. Promise what they get by the end.'),
        h(2, 'Intro'),
        hint('Who you are, what this video covers, why it matters now.'),
        h(2, 'Chapter 1'),
        p(),
        h(2, 'Chapter 2'),
        p(),
        h(2, 'Chapter 3'),
        p(),
        h(2, 'Outro & CTA'),
        hint('Recap, then point to the next video.'),
        hr(),
        h(3, 'Description'),
        hint('First two lines show above the fold — make them count.'),
        h(3, 'Tags'),
        hint('Comma-separated keywords'),
      ),
  },
  {
    id: 'carousel',
    name: 'Carousel',
    description: 'Slide-by-slide copy for Instagram or LinkedIn carousels.',
    icon: 'layers',
    kind: 'content',
    status: 'drafting',
    platforms: ['instagram', 'linkedin'],
    title: '',
    build: () =>
      doc(
        h(3, 'Slide 1 · Hook'),
        hint('A big promise in under eight words'),
        h(3, 'Slide 2'),
        hint('The problem or the context'),
        h(3, 'Slide 3'),
        p(),
        h(3, 'Slide 4'),
        p(),
        h(3, 'Slide 5'),
        p(),
        h(3, 'Slide 6'),
        hint('The key takeaway'),
        h(3, 'Slide 7 · CTA'),
        hint('Save it, share it, follow for more'),
        hr(),
        h(3, 'Caption'),
        hint('Caption and hashtags'),
      ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn post',
    description: 'Hook, short lines, a takeaway and a question.',
    icon: 'briefcase',
    kind: 'content',
    status: 'drafting',
    platforms: ['linkedin'],
    title: '',
    build: () =>
      doc(
        hint('Hook line — earn the “…see more” click.'),
        p(),
        hint('Short lines. One idea per line.'),
        p(),
        hint('The lesson or the takeaway.'),
        p(),
        hint('Close with a question to start the conversation.'),
      ),
  },
  {
    id: 'thread',
    name: 'Thread',
    description: 'A numbered thread for X or Threads.',
    icon: 'thread',
    kind: 'content',
    status: 'drafting',
    platforms: ['x', 'threads'],
    title: '',
    build: () =>
      doc(
        hint('1/ The hook — promise the payoff.'),
        hr(),
        hint('2/'),
        hr(),
        hint('3/'),
        hr(),
        hint('4/'),
        hr(),
        hint('5/ Recap and CTA — follow, or repost the first post.'),
      ),
  },
  {
    id: 'idea',
    name: 'Idea',
    description: 'Capture an idea fast: the angle, the format, references.',
    icon: 'lightbulb',
    kind: 'content',
    status: 'idea',
    platforms: [],
    title: '',
    build: () =>
      doc(
        h(2, 'The idea'),
        hint('One sentence. What is the post?'),
        h(2, 'Angle'),
        hint('Why you, why now? What makes it different?'),
        h(2, 'Format'),
        hint('Reel, carousel, thread, long-form…'),
        h(2, 'References'),
        bullets(hint('Links, screenshots, inspiration')),
      ),
  },
  {
    id: 'log-post',
    name: 'Log a published post',
    description: 'Archive something already live — final copy, link and numbers.',
    icon: 'archive',
    kind: 'content',
    status: 'posted',
    platforms: [],
    title: '',
    datedToday: true,
    build: () =>
      doc(
        h(2, 'Final copy'),
        hint('Paste exactly what went live — the caption, script or post.'),
        h(2, 'Notes'),
        hint('What worked? What would you change next time?'),
      ),
  },
  {
    id: 'note',
    name: 'Note',
    description: 'Reference material kept out of the pipeline — strategy, voice, research.',
    icon: 'note',
    kind: 'note',
    status: 'drafting',
    platforms: [],
    title: '',
    build: () => doc(p()),
  },
];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function welcomeContent(): RichNode {
  return doc(
    p('This is your private space for scripts, posts and everything you publish. It all lives in this browser — nothing is uploaded anywhere.'),
    h(2, 'How it is organised'),
    bullets(
      rich(bold('Spaces'), text(' are the big areas — your personal brand, a client, a channel.')),
      rich(bold('Folders'), text(' live inside spaces and nest as deep as you need.')),
      rich(bold('Documents'), text(' hold your scripts, captions, threads and notes.')),
    ),
    h(2, 'Move fast'),
    bullets(
      rich(bold('⌘K / Ctrl K'), text(' — search everything and run any command.')),
      rich(bold('N'), text(' — new document from a template.')),
      p('Drag documents and folders onto any folder or space in the sidebar to move them.'),
      p('Right-click anything in the sidebar for more options.'),
    ),
    h(2, 'Track every post'),
    p('Each document has a status — Idea, Drafting, Ready, Scheduled, Posted — plus platforms, a publish date, the live link and its numbers. Open the Details panel (top right) to edit them. The Pipeline and the Calendar show the big picture.'),
    h(2, 'Record on camera'),
    p('Open any script in the Teleprompter for a full-screen, auto-scrolling read.'),
    h(2, 'Keep a backup'),
    p('Your data is stored locally in this browser. Export a backup from Settings now and then — clearing your browser data deletes everything.'),
  );
}
