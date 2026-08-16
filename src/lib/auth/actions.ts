/**
 * Sign in, sign up, sign out.
 *
 * Thin over `supabase.auth`, and deliberately so — the interesting consequences of an
 * auth change (clearing the replica, writing the `app_user` row, connecting sync) are
 * driven by the session listener in `session.tsx` rather than by these functions, so
 * they happen on a session restored from storage too, not only on a fresh sign-in.
 */

import { requiredText } from "../db/constraints";
import { supabase } from "../db/supabase";

export type SignUpResult =
  /** Session is live; the session listener takes it from here. */
  | { status: "signed-in" }
  /**
   * Supabase accepted the account but issued no session, because the project requires
   * a confirmed email address. Nothing is wrong — the user has to open the link.
   */
  | { status: "needs-confirmation" };

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  if (error) throw error;
}

/**
 * Creates the account, carrying the display name in user metadata.
 *
 * The metadata is not the domain record — `app_user` is, and it is written by the
 * session listener. Metadata is how the name survives the round trip in between, and
 * how it is still available if the account is confirmed by email later on another
 * device.
 */
export async function signUp(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<SignUpResult> {
  const displayName = requiredText(input.displayName, "A display name");

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;

  return data.session ? { status: "signed-in" } : { status: "needs-confirmation" };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Turns a Supabase auth error into something worth showing a person.
 *
 * Supabase's messages are written for developers — "Invalid login credentials" is fine,
 * "AuthApiError: For security purposes, you can only request this after 21 seconds" is
 * not. Anything unrecognised falls through to its own message rather than to a generic
 * one, because a wrong-but-specific error is easier to report than a vague one.
 */
export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match an account.";
  }
  if (/user already registered/i.test(message)) {
    return "There's already an account with that email. Sign in instead.";
  }
  // Only reachable when the project requires a confirmed address. Worth its own case
  // because the account does exist — retrying the password will never be the fix.
  if (/email not confirmed/i.test(message)) {
    return "Open the confirmation link we emailed you, then sign in.";
  }
  if (/password should be at least/i.test(message)) {
    return "Passwords need to be at least 6 characters.";
  }
  if (/unable to validate email|invalid email/i.test(message)) {
    return "That doesn't look like an email address.";
  }
  // Two different limits wear the same wording. The per-request throttle clears in
  // under a minute; the mailer's hourly cap does not, and telling someone to wait a
  // minute for that one sends them round the same loop until it lapses.
  if (/email rate limit|over_email_send_rate_limit/i.test(message)) {
    return "Too many emails sent from this project just now. Try again later.";
  }
  if (/only request this after|rate limit/i.test(message)) {
    return "Too many tries just now. Give it a moment.";
  }
  if (/network|fetch failed/i.test(message)) {
    return "Couldn't reach the server. Check your connection.";
  }

  return message;
}
