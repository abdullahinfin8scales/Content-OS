import { Link2, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { detectPlatform, loadBrandCatalog, type BrandIcon, type Detection } from '../../lib/platformDetect';
import { platformInfo } from '../../lib/platforms';
import { toast } from '../../state/feedback';
import { repo } from '../../state/repo';
import { useUI } from '../../state/ui';
import { useWorkspace } from '../../state/workspace';
import { PlatformGlyph } from '../ui/Badges';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Add a social platform from a link: the logo, name and (when known) post
 * limit are filled in from the bundled logo catalogue. Nothing is fetched.
 */
export function AddPlatformDialog() {
  const ws = useWorkspace();
  const request = useUI((s) => s.addPlatform);
  const set = useUI((s) => s.set);
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [brands, setBrands] = useState<BrandIcon[] | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [limit, setLimit] = useState('');
  const [limitEdited, setLimitEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  const open = !!request;
  const doc = request?.docId ? ws.docById.get(request.docId) : undefined;

  useEffect(() => {
    if (!open) return;
    setInput('');
    setDebounced('');
    setName('');
    setNameEdited(false);
    setLimit('');
    setLimitEdited(false);
    let alive = true;
    void loadBrandCatalog().then((b) => alive && setBrands(b));
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 250);
    return () => clearTimeout(t);
  }, [input]);

  const detection: Detection | null = useMemo(
    () => (debounced.trim() && brands !== undefined ? detectPlatform(debounced, brands) : null),
    [debounced, brands],
  );

  // Fill the name and limit from what was found, unless the user changed them.
  useEffect(() => {
    if (!detection) return;
    if (!nameEdited) setName(detection.name);
    if (!limitEdited) setLimit(detection.limit ? String(detection.limit) : '');
  }, [detection, nameEdited, limitEdited]);

  const existing = useMemo(() => {
    if (!detection) return null;
    if (detection.builtin) return platformInfo(ws.platforms, detection.builtin);
    const key = name.trim().toLowerCase();
    return (
      ws.platforms.list.find(
        (p) => (detection.domain && p.domain === detection.domain) || (key && p.name.toLowerCase() === key),
      ) ?? null
    );
  }, [detection, name, ws.platforms]);

  const close = () => set({ addPlatform: null });

  // Already on this post: nothing to add, the button just closes.
  const onPost = !!existing && !!doc && doc.platforms.includes(existing.id);

  const useExisting = async () => {
    if (!existing) return;
    close();
    if (!doc || onPost) return;
    await repo.updateDoc(doc.id, { platforms: [...doc.platforms, existing.id] });
    toast(`${existing.name} added to this post`);
  };

  const add = async () => {
    if (!detection || existing || saving) return;
    setSaving(true);
    try {
      const parsedLimit = Number(limit.replace(/[,\s]/g, ''));
      const platform = await repo.createPlatform({
        name: name.trim() || detection.name,
        url: detection.url,
        domain: detection.domain,
        icon: detection.icon,
        limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null,
      });
      if (doc) await repo.updateDoc(doc.id, { platforms: [...doc.platforms, platform.id] });
      close();
      toast(`${platform.name} added${doc ? ' to this post' : ''}`, { tone: 'success' });
    } finally {
      setSaving(false);
    }
  };

  const loading = brands === undefined;
  const invalid = !!debounced.trim() && !loading && !detection;
  const displayName = name.trim() || detection?.name || '';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a platform"
      description="Paste a link to the platform or your profile on it. The logo and name are filled in for you."
      width={480}
      labelledBy="add-platform-title"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {existing ? (
            <Button variant="primary" onClick={() => void useExisting()}>
              {doc && !onPost ? `Use ${existing.name}` : 'Done'}
            </Button>
          ) : (
            <Button variant="primary" disabled={!detection || saving || !displayName} onClick={() => void add()}>
              Add platform
            </Button>
          )}
        </>
      }
    >
      <form
        className="space-y-4 px-6 pt-3 pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (existing) void useExisting();
          else void add();
        }}
      >
        <label className="relative flex items-center">
          <Link2 size={15} className="pointer-events-none absolute left-3 text-fg-4" />
          <input
            id="platform-link"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://bsky.app/profile/you — or a name like Pinterest"
            aria-label="Platform link"
            className="field h-10! pl-9! text-[13.5px]"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {loading && debounced.trim() && (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
            <LoaderCircle size={14} className="spinner" /> Looking up the logo…
          </div>
        )}
        {invalid && <p className="text-[12.5px] text-fg-3">That doesn’t look like a link. Try something like https://pinterest.com, or type the platform’s name.</p>}

        {detection && (
          <div className="flex items-start gap-4 rounded-2xl border border-line bg-sunken p-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-raised text-fg">
              <PlatformGlyph icon={existing ? existing.icon : detection.icon} name={displayName} size={28} />
            </span>
            <div className="min-w-0 flex-1 space-y-2.5">
              {existing ? (
                <p className="pt-1 text-[13px] leading-relaxed text-fg-2">
                  <span className="font-semibold text-fg">{existing.name}</span> is already in your platforms
                  {doc ? (onPost ? ' and on this post.' : '. Use it for this post?') : '.'}
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] text-fg-4">Name</span>
                    <input
                      id="platform-name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setNameEdited(true);
                      }}
                      maxLength={40}
                      className="field h-8! text-[13px]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] text-fg-4">Character limit per post (optional)</span>
                    <input
                      id="platform-limit"
                      value={limit}
                      onChange={(e) => {
                        setLimit(e.target.value.replace(/[^\d]/g, ''));
                        setLimitEdited(true);
                      }}
                      inputMode="numeric"
                      placeholder="No limit"
                      className="field h-8! w-[140px] text-[13px] tabular-nums"
                    />
                  </label>
                  <p className="text-[11.5px] leading-relaxed text-fg-4">
                    {detection.matched ? 'Logo found.' : 'No logo found for this site, so it gets a letter badge.'}
                    {detection.domain ? ` ${detection.domain}` : ''}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
