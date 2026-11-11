import { LoaderCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Wordmark } from '../../brand/Logo';
import { clearLocal, CURSOR_KEY, getMeta, hasLocalData, prepareForUser } from '../../sync/engine';
import { supabaseServer } from '../../sync/supabase';
import { initAuth, refreshSession, sendPasswordReset, setNewPassword, signIn, signOut, signUp, useAuth } from '../../state/auth';
import { db } from '../../state/repo';
import { downloadAll, startSync, stopSync } from '../../state/sync';
import { Button } from '../ui/Button';

const MIN_PASSWORD = 8;

/**
 * Stands in front of the app when accounts are on: sign in first, then tie
 * this laptop's data to the account (uploading posts written before accounts
 * existed), download the account's posts on a new laptop, and keep syncing.
 */
export function AuthGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    initAuth();
  }, []);

  if (status === 'off') return <>{children}</>;
  if (status === 'loading') return <>{fallback}</>;
  if (status === 'recovery') return <NewPasswordScreen />;
  if (status === 'signedOut' || !user) return <SignInScreen />;
  return (
    <AccountData key={user.id} userId={user.id} email={user.email} fallback={fallback}>
      {children}
    </AccountData>
  );
}

/* ------------------------------- layout ------------------------------- */

function Card({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-frame px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-3 text-fg">
          <Wordmark className="h-[18px] w-auto" />
        </div>
        <div className="rounded-2xl border border-line-strong bg-raised p-6 shadow-card sm:p-7">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-fg">{title}</h1>
          {body && <div className="mt-1.5 text-[13px] leading-relaxed text-fg-3">{body}</div>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  ...input
}: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-fg-3">{label}</span>
      <input id={id} {...input} className="field h-10! w-full text-[14px]" />
    </label>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] leading-relaxed text-fg">
      {text}
    </p>
  );
}

function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[12.5px] text-fg-3 underline-offset-2 hover:text-fg hover:underline">
      {children}
    </button>
  );
}

/* ------------------------------- sign in ------------------------------- */

type Mode = 'signIn' | 'signUp' | 'forgot' | 'checkEmail' | 'resetSent';

function SignInScreen() {
  const signupOpen = useAuth((s) => s.signupOpen);
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setPassword('');
  };

  const run = (action: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'checkEmail' || mode === 'resetSent') {
    return (
      <Card
        title="Check your email"
        body={
          mode === 'checkEmail' ? (
            <>
              We sent a link to <b className="text-fg">{email.trim()}</b>. Open it to confirm your account, then sign in here.
            </>
          ) : (
            <>
              We sent a reset link to <b className="text-fg">{email.trim()}</b>. Open it <b className="text-fg">on this laptop, in this browser</b>.
            </>
          )
        }
      >
        <Button variant="primary" className="h-10! w-full" onClick={() => go('signIn')}>
          Back to sign in
        </Button>
      </Card>
    );
  }

  if (mode === 'forgot') {
    return (
      <Card title="Reset your password" body="We’ll email you a link to choose a new password.">
        <form
          className="space-y-4"
          onSubmit={run(async () => {
            const err = await sendPasswordReset(email);
            if (err) setError(err);
            else setMode('resetSent');
          })}
        >
          <Field label="Email" id="auth-email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorLine text={error} />
          <Button type="submit" variant="primary" className="h-10! w-full" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
          <div className="text-center">
            <LinkButton onClick={() => go('signIn')}>Back to sign in</LinkButton>
          </div>
        </form>
      </Card>
    );
  }

  const creating = mode === 'signUp';
  return (
    <Card
      title={creating ? 'Create your account' : 'Sign in'}
      body={
        creating
          ? 'Your posts are saved to this account and kept on this laptop. Password-reset emails go to this address.'
          : 'Your posts are saved to your account and kept on this laptop, so they’re never lost when the browser is cleared.'
      }
    >
      <form
        className="space-y-4"
        onSubmit={run(async () => {
          if (creating) {
            if (password.length < MIN_PASSWORD) {
              setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
              return;
            }
            const res = await signUp(email, password);
            if (res.error) setError(res.error);
            else if (res.confirm) setMode('checkEmail');
          } else {
            const err = await signIn(email, password);
            if (err) setError(err);
          }
        })}
      >
        <Field label="Email" id="auth-email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label={creating ? `Password (at least ${MIN_PASSWORD} characters)` : 'Password'}
          id="auth-password"
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          required
          minLength={creating ? MIN_PASSWORD : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorLine text={error} />
        <Button type="submit" variant="primary" className="h-10! w-full" disabled={busy || !email.trim() || !password}>
          {busy ? (creating ? 'Creating…' : 'Signing in…') : creating ? 'Create account' : 'Sign in'}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {creating ? (
            <LinkButton onClick={() => go('signIn')}>I already have an account</LinkButton>
          ) : (
            <>
              <LinkButton onClick={() => go('forgot')}>Forgot password?</LinkButton>
              {signupOpen && <LinkButton onClick={() => go('signUp')}>Create an account</LinkButton>}
            </>
          )}
        </div>
      </form>
    </Card>
  );
}

function NewPasswordScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Set a new password" body="Choose the password you’ll sign in with from now on.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < MIN_PASSWORD) {
            setError(`Use at least ${MIN_PASSWORD} characters.`);
            return;
          }
          setBusy(true);
          const err = await setNewPassword(password);
          setBusy(false);
          setError(err);
        }}
      >
        <Field
          label={`New password (at least ${MIN_PASSWORD} characters)`}
          id="auth-new-password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorLine text={error} />
        <Button type="submit" variant="primary" className="h-10! w-full" disabled={busy || !password}>
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </Card>
  );
}

/* ---------------------------- account data ---------------------------- */

type Phase = 'checking' | 'other' | 'downloading' | 'failed' | 'ready';

function AccountData({ userId, email, fallback, children }: { userId: string; email: string; fallback: ReactNode; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [rows, setRows] = useState(0);
  const [otherPending, setOtherPending] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const own = await prepareForUser(db, userId);
      if (cancelled) return;
      if (own === 'other') {
        setOtherPending(await db.outbox.count());
        setPhase('other');
        return;
      }
      // A new laptop (or one that was signed out): get the account's posts before showing the app.
      const firstTime = !(await getMeta(db, CURSOR_KEY)) && !(await hasLocalData(db));
      if (firstTime) {
        setPhase('downloading');
        try {
          await downloadAll(supabaseServer, (n) => !cancelled && setRows(n));
        } catch (err) {
          if (cancelled) return;
          setMessage(err instanceof Error ? err.message : String(err));
          setPhase('failed');
          return;
        }
      }
      if (cancelled) return;
      startSync(supabaseServer, { refreshSession });
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [userId, attempt]);

  if (phase === 'ready') return <>{children}</>;
  if (phase === 'checking') return <>{fallback}</>;

  if (phase === 'downloading') {
    return (
      <Card title="Downloading your posts…" body="This happens once on each laptop. Keep this page open.">
        <div className="flex items-center gap-2.5 text-[13px] text-fg-3">
          <LoaderCircle size={16} className="spinner" />
          <span className="tabular-nums">{rows ? `${rows.toLocaleString()} items received` : 'Connecting…'}</span>
        </div>
      </Card>
    );
  }

  if (phase === 'failed') {
    return (
      <Card title="Couldn’t download your posts" body={message ?? 'The cloud didn’t answer.'}>
        <div className="flex gap-2">
          <Button variant="primary" className="h-10! flex-1" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
          <Button className="h-10!" onClick={() => void signOut({ discard: true })}>
            Sign out
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="This laptop has another account’s posts"
      body={
        <>
          You signed in as <b className="text-fg">{email}</b>, but the posts on this laptop belong to a different account. They stay safe in that
          account. Remove them from this laptop to continue?
          {otherPending > 0 && (
            <span className="mt-2 block text-[var(--st-drafting)]">
              {otherPending} change{otherPending === 1 ? '' : 's'} from that account never reached the cloud and will be lost.
            </span>
          )}
        </>
      }
    >
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="h-10! flex-1"
          onClick={async () => {
            await clearLocal(db);
            setAttempt((n) => n + 1);
          }}
        >
          Remove and continue
        </Button>
        <Button className="h-10!" onClick={() => void signOut({ discard: true, keepLocal: true })}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}

