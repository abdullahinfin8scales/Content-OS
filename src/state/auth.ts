import type { AuthError, Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { SUPABASE_KEY, SUPABASE_URL, SYNC_ENABLED } from '../lib/env';
import { clearLocal } from '../sync/engine';
import { AUTH_STORAGE_KEY, supabase } from '../sync/supabase';
import { db } from './repo';
import { stopSync, syncNow } from './sync';

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * - `off`: no accounts (the claude.ai preview, or Supabase not configured).
 * - `recovery`: opened from a password-reset email; a new password is needed.
 */
export type AuthStatus = 'off' | 'loading' | 'signedOut' | 'signedIn' | 'recovery';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Whether new accounts can be created (it is switched off once the owner's account exists). */
  signupOpen: boolean;
  /** Signed in from the saved session while the cloud couldn't be reached. */
  offline: boolean;
}

export const useAuth = create<AuthState>(() => ({
  status: SYNC_ENABLED ? 'loading' : 'off',
  user: null,
  signupOpen: false,
  offline: false,
}));

const toUser = (session: Session): AuthUser => ({ id: session.user.id, email: session.user.email ?? '' });

function isNetworkError(error: { name?: string; status?: number; message?: string } | null | undefined) {
  if (!error) return false;
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network|load failed/i.test(error.message ?? '');
}

/** The account saved in this browser, for opening the app offline. */
function savedUser(): AuthUser | null {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') as { user?: { id?: string; email?: string }; refresh_token?: string } | null;
    return raw?.refresh_token && raw.user?.id ? { id: raw.user.id, email: raw.user.email ?? '' } : null;
  } catch {
    return null;
  }
}

async function loadSignupSetting() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
    if (!res.ok) return;
    const settings = (await res.json()) as { disable_signup?: boolean };
    useAuth.setState({ signupOpen: settings.disable_signup === false });
  } catch {
    // Offline: the sign-in form still works with a saved session.
  }
}

let started = false;

/** Restores the session (or the password-reset link) and follows sign-in changes. */
export function initAuth() {
  if (!SYNC_ENABLED || started) return;
  started = true;
  const auth = supabase().auth;
  auth.onAuthStateChange((event, session) => {
    // Keep this synchronous: Supabase waits for these callbacks.
    if (event === 'INITIAL_SESSION') return;
    if (event === 'PASSWORD_RECOVERY') {
      useAuth.setState({ status: 'recovery', user: session ? toUser(session) : null, offline: false });
    } else if (event === 'SIGNED_OUT') {
      useAuth.setState({ status: 'signedOut', user: null, offline: false });
    } else if (session && useAuth.getState().status !== 'recovery') {
      useAuth.setState({ status: 'signedIn', user: toUser(session), offline: false });
    }
  });
  void loadSignupSetting();
  void auth.getSession().then(({ data, error }) => {
    if (useAuth.getState().status === 'recovery') return;
    if (data.session) {
      useAuth.setState({ status: 'signedIn', user: toUser(data.session), offline: false });
      return;
    }
    const saved = savedUser();
    if (saved && isNetworkError(error)) useAuth.setState({ status: 'signedIn', user: saved, offline: true });
    else useAuth.setState({ status: 'signedOut', user: null, offline: false });
  });
}

/** Plain-language versions of Supabase's sign-in errors. */
export function authMessage(error: Pick<AuthError, 'message'> & { code?: string; status?: number; name?: string }): string {
  if (isNetworkError(error)) return 'Can’t reach the server. Check your internet connection and try again.';
  switch (error.code) {
    case 'invalid_credentials':
      return 'Wrong email or password.';
    case 'email_not_confirmed':
      return 'Confirm your email first — open the link we sent you.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead.';
    case 'weak_password':
      return 'Choose a stronger password: at least 8 characters.';
    case 'same_password':
      return 'That’s your current password. Choose a new one.';
    case 'signup_disabled':
      return 'Creating accounts is switched off.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'email_address_invalid':
      return 'That email address doesn’t look right.';
    case 'email_address_not_authorized':
      return 'Supabase can’t send email to this address yet (its free email only reaches the project’s team).';
  }
  return error.message || 'Something went wrong. Please try again.';
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  return error ? authMessage(error) : null;
}

/** Returns `confirm` when Supabase wants the email confirmed before the first sign-in. */
export async function signUp(email: string, password: string): Promise<{ error?: string; confirm?: boolean }> {
  const { data, error } = await supabase().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) return { error: authMessage(error) };
  return data.session ? {} : { confirm: true };
}

export async function sendPasswordReset(email: string): Promise<string | null> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
  return error ? authMessage(error) : null;
}

/** Sets a new password (after a reset link, or from Settings). */
export async function setNewPassword(password: string): Promise<string | null> {
  const { data, error } = await supabase().auth.updateUser({ password });
  if (error) return authMessage(error);
  if (useAuth.getState().status === 'recovery') {
    const { data: s } = await supabase().auth.getSession();
    const session = s.session;
    useAuth.setState({ status: 'signedIn', user: session ? toUser(session) : data.user ? { id: data.user.id, email: data.user.email ?? '' } : null });
  }
  return null;
}

export async function refreshSession(): Promise<boolean> {
  const { data, error } = await supabase().auth.refreshSession();
  return !error && !!data.session;
}

/**
 * Signs out and removes this laptop's copy; the cloud copy stays.
 * Unless `discard` is set, first uploads waiting changes, and stops if some
 * couldn't be uploaded (returns how many) so the caller can ask.
 * `keepLocal` leaves this laptop's data alone (it belongs to another account).
 */
export async function signOut(opts: { discard?: boolean; keepLocal?: boolean } = {}): Promise<{ pending: number; error?: string }> {
  if (!opts.discard) {
    await syncNow();
    const pending = await db.outbox.count();
    if (pending) return { pending };
  }
  const { error } = await supabase().auth.signOut({ scope: 'local' });
  if (error && isNetworkError(error)) return { pending: 0, error: 'You’re offline. Connect to the internet to sign out.' };
  stopSync();
  if (!opts.keepLocal) await clearLocal(db);
  useAuth.setState({ status: 'signedOut', user: null, offline: false });
  return { pending: 0 };
}
