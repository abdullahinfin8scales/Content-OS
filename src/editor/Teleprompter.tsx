import { FlipHorizontal, Maximize2, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Mark } from '../brand/Logo';
import { cx } from '../components/ui/Button';

const PREFS_KEY = 'infin8.prompter';

function loadPrefs(): { speed: number; size: number; mirror: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      speed: typeof raw.speed === 'number' ? raw.speed : 3,
      size: typeof raw.size === 'number' ? raw.size : 52,
      mirror: raw.mirror === true,
    };
  } catch {
    return { speed: 3, size: 52, mirror: false };
  }
}

function Ctl({ label, onClick, children, active, keyHint }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; keyHint?: string }) {
  return (
    <button
      aria-label={label}
      data-tip={label}
      data-tip-key={keyHint}
      onClick={onClick}
      className={cx(
        'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
        active ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

/** Full-screen, auto-scrolling read of a script — for recording to camera. */
export function Teleprompter({ title, html, onClose }: { title: string; html: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const initial = useRef(loadPrefs());
  const [speed, setSpeed] = useState(initial.current.speed);
  const [size, setSize] = useState(initial.current.size);
  const [mirror, setMirror] = useState(initial.current.mirror);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ speed, size, mirror }));
    } catch {
      /* private mode */
    }
  }, [speed, size, mirror]);

  // Scrolling loop. Speed 1–10 ≈ 0.1–1 lines per second.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const el = scroller.current;
      if (!el) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      carry += speed * 0.1 * size * 1.45 * dt;
      const step = Math.floor(carry);
      carry -= step;
      if (step) el.scrollTop += step;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, size]);

  // 3-2-1 countdown before rolling.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setPlaying(true);
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 700);
    return () => clearTimeout(t);
  }, [countdown]);

  const toggle = useCallback(() => {
    if (countdown !== null) {
      setCountdown(null);
      return;
    }
    if (playing) setPlaying(false);
    else setCountdown(3);
  }, [playing, countdown]);

  const restart = () => {
    setPlaying(false);
    setCountdown(null);
    scroller.current?.scrollTo({ top: 0 });
  };

  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case ' ':
          toggle();
          break;
        case 'Escape':
          close();
          break;
        case 'ArrowUp':
          setSpeed((s) => Math.min(10, s + 1));
          break;
        case 'ArrowDown':
          setSpeed((s) => Math.max(1, s - 1));
          break;
        case '+':
        case '=':
          setSize((s) => Math.min(120, s + 4));
          break;
        case '-':
          setSize((s) => Math.max(24, s - 4));
          break;
        case 'm':
        case 'M':
          setMirror((m) => !m);
          break;
        case 'r':
        case 'R':
        case 'Home':
          restart();
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [toggle, close]);

  // Hide controls while rolling and the mouse is still.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 2200);
    };
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', wake);
    };
  }, []);

  const hideChrome = playing && idle;

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[60] bg-black text-white animate-fade" role="dialog" aria-modal="true" aria-label={`Teleprompter: ${title}`}>
      <div ref={scroller} className="absolute inset-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto px-[6vw]" style={{ maxWidth: Math.max(720, size * 17), paddingTop: '42vh', paddingBottom: '70vh' }}>
          <div className="prompter-text" style={{ fontSize: size, transform: mirror ? 'scaleX(-1)' : undefined }}>
            {title && <div className="mb-[0.8em] font-display text-[0.42em] tracking-[0.2em] text-white/40 uppercase">{title}</div>}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>

      {/* Reading line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34vh] bg-gradient-to-b from-black via-black/85 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[32vh] bg-gradient-to-t from-black via-black/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-[42vh] flex -translate-y-1/2 items-center justify-between px-3 opacity-60">
        <span className="h-10 w-[3px] rounded-full bg-white" />
        <span className="h-10 w-[3px] rounded-full bg-white" />
      </div>

      {countdown !== null && countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span key={countdown} className="font-display text-[22vh] leading-none text-white animate-pop">
            {countdown}
          </span>
        </div>
      )}

      {/* Header */}
      <div className={cx('absolute inset-x-0 top-0 flex items-center gap-3 px-5 py-4 transition-opacity duration-500', hideChrome && 'opacity-0')}>
        <Mark className="h-4 w-auto text-white/80" />
        <span className="label-display text-white/50!">Teleprompter</span>
        <span className="flex-1" />
        <span className="hidden text-[12px] text-white/40 sm:block">Space play · ↑↓ speed · +/− size · M mirror · R restart</span>
        <button aria-label="Close teleprompter" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* Controls */}
      <div
        className={cx(
          'absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-neutral-900/90 p-1.5 shadow-2xl backdrop-blur transition-opacity duration-500',
          hideChrome && 'pointer-events-none opacity-0',
        )}
      >
        <Ctl label="Restart" keyHint="R" onClick={restart}>
          <RotateCcw size={17} />
        </Ctl>
        <button
          onClick={toggle}
          className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
        >
          {playing || countdown !== null ? <Pause size={16} /> : <Play size={16} />}
          {playing ? 'Pause' : countdown !== null ? 'Cancel' : 'Start'}
        </button>
        <span className="mx-1 h-6 w-px bg-white/15" />
        <Ctl label="Slower" keyHint="↓" onClick={() => setSpeed((s) => Math.max(1, s - 1))}>
          <Minus size={16} />
        </Ctl>
        <span className="w-14 text-center text-[12px] text-white/70 tabular-nums">Speed {speed}</span>
        <Ctl label="Faster" keyHint="↑" onClick={() => setSpeed((s) => Math.min(10, s + 1))}>
          <Plus size={16} />
        </Ctl>
        <span className="mx-1 h-6 w-px bg-white/15" />
        <Ctl label="Smaller text" keyHint="−" onClick={() => setSize((s) => Math.max(24, s - 4))}>
          <span className="text-[13px] font-semibold">A</span>
        </Ctl>
        <Ctl label="Larger text" keyHint="+" onClick={() => setSize((s) => Math.min(120, s + 4))}>
          <span className="text-[18px] font-semibold">A</span>
        </Ctl>
        <Ctl label="Mirror" keyHint="M" active={mirror} onClick={() => setMirror((m) => !m)}>
          <FlipHorizontal size={17} />
        </Ctl>
        <Ctl
          label="Full screen"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void root.current?.requestFullscreen?.().catch(() => undefined);
          }}
        >
          <Maximize2 size={16} />
        </Ctl>
      </div>
    </div>,
    document.body,
  );
}
