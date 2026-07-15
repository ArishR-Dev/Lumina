/**
 * Private Album — session unlock + optional PIN gate.
 *
 * `unlocked` is a per-tab session flag (sessionStorage): it clears when the
 * browser tab closes.
 *
 * ---------------------------------------------------------------------------
 * PIN storage (v2 — PBKDF2)
 * ---------------------------------------------------------------------------
 * The PIN and (optional) recovery-answer are stored as PBKDF2-SHA-256
 * derivations with a per-secret random salt and 200 000 iterations. The
 * record is a JSON string of shape:
 *
 *   { v: 2, algo: "PBKDF2-SHA256", salt, iterations, hash }
 *
 * where `salt` and `hash` are base64url-encoded raw bytes.
 *
 * Legacy records written by v1 were bare hex SHA-256 digests (64 hex
 * chars, no salt). `verifyPin` / `verifyForgotAnswer` transparently
 * validate legacy records and, on success, immediately re-hash the input
 * with PBKDF2 + a fresh salt and overwrite the record. No user action is
 * required — migration is automatic and one-shot per secret.
 *
 * ---------------------------------------------------------------------------
 * Recovery (Forgot-PIN)
 * ---------------------------------------------------------------------------
 * A recovery challenge is *entirely opt-in*. There is no built-in
 * question or built-in answer. `hasCustomForgotChallenge()` is the only
 * source of truth for whether recovery is available; callers MUST hide or
 * disable the "Forgot PIN?" affordance when it returns false.
 * `verifyForgotAnswer` will refuse to authenticate unless a challenge is
 * explicitly configured.
 */

import { useSyncExternalStore } from "react";

const UNLOCK_KEY = "lumina.privateAlbum.unlocked";
const PIN_KEY = "lumina.privateAlbum.pinHash";

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

function isUnlockedRaw(): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; }
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useAlbumUnlocked(): boolean {
  return useSyncExternalStore(subscribe, isUnlockedRaw, () => false);
}

export function isAlbumUnlocked(): boolean { return isUnlockedRaw(); }

export function unlockAlbum() {
  try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch { /* ignore */ }
  emit();
}

export function lockAlbum() {
  try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* ignore */ }
  emit();
}

// ---------- Unlock cinematic playing (in-memory) ----------

let cinematicPlaying = false;
const cinematicListeners = new Set<Listener>();
const emitCinematic = () => cinematicListeners.forEach((l) => l());

function subscribeCinematic(l: Listener) {
  cinematicListeners.add(l);
  return () => { cinematicListeners.delete(l); };
}
function getCinematic() { return cinematicPlaying; }

export function useUnlockCinematicPlaying(): boolean {
  return useSyncExternalStore(subscribeCinematic, getCinematic, () => false);
}

export function setUnlockCinematicPlaying(v: boolean) {
  if (cinematicPlaying === v) return;
  cinematicPlaying = v;
  emitCinematic();
}

// ---------- Hash primitives ----------

const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_HASH = "SHA-256";
const PBKDF2_KEY_BITS = 256;
const SALT_BYTES = 16;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(text: string, saltBytes: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(text),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: PBKDF2_HASH, salt: saltBytes as BufferSource, iterations },
    material,
    PBKDF2_KEY_BITS,
  );
  return new Uint8Array(bits);
}

type PbkdfRecord = {
  v: 2;
  algo: "PBKDF2-SHA256";
  salt: string;      // base64url
  iterations: number;
  hash: string;      // base64url
};

async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(secret, salt, PBKDF2_ITERATIONS);
  const record: PbkdfRecord = {
    v: 2,
    algo: "PBKDF2-SHA256",
    salt: b64url(salt),
    iterations: PBKDF2_ITERATIONS,
    hash: b64url(hash),
  };
  return JSON.stringify(record);
}

function parseRecord(raw: string | null): PbkdfRecord | { legacy: true; hex: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Legacy v1 record: 64 hex chars, no JSON envelope.
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return { legacy: true, hex: trimmed.toLowerCase() };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed && typeof parsed === "object"
      && (parsed as PbkdfRecord).v === 2
      && (parsed as PbkdfRecord).algo === "PBKDF2-SHA256"
      && typeof (parsed as PbkdfRecord).salt === "string"
      && typeof (parsed as PbkdfRecord).hash === "string"
      && typeof (parsed as PbkdfRecord).iterations === "number"
    ) {
      return parsed as PbkdfRecord;
    }
  } catch { /* fall through */ }
  return null;
}

/** Constant-time string comparison for equal-length ASCII strings. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyAgainst(record: NonNullable<ReturnType<typeof parseRecord>>, secret: string): Promise<boolean> {
  if ("legacy" in record) {
    const digest = await sha256Hex(secret);
    return timingSafeEqualStr(digest, record.hex);
  }
  const salt = fromB64url(record.salt);
  const derived = await pbkdf2(secret, salt, record.iterations);
  return timingSafeEqualStr(b64url(derived), record.hash);
}

// ---------- PIN ----------

/**
 * Normalize a raw PIN string identically at set-time and verify-time.
 *
 * Rules (deliberately preserve leading zeros so a PIN like "0000" hashes
 * to the same value on both sides):
 * - Strip surrounding whitespace only. Never trim characters inside.
 * - Reject anything that isn't 4–10 ASCII digits.
 */
export function normalizePin(raw: string): { ok: true; pin: string } | { ok: false; error: string } {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return { ok: false, error: "Enter your PIN" };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: "PIN must contain digits only" };
  if (trimmed.length < 4) return { ok: false, error: "PIN must be at least 4 digits" };
  if (trimmed.length > 10) return { ok: false, error: "PIN must be at most 10 digits" };
  return { ok: true, pin: trimmed };
}

export function hasPin(): boolean {
  if (typeof window === "undefined") return false;
  try { return !!localStorage.getItem(PIN_KEY); } catch { return false; }
}

export async function setPin(pin: string): Promise<void> {
  const norm = normalizePin(pin);
  if (!norm.ok) throw new Error(norm.error);
  const record = await hashSecret(norm.pin);
  localStorage.setItem(PIN_KEY, record);
}

/**
 * Verify a PIN against the stored record.
 *
 * Contract:
 *   - Returns `false` when no PIN is stored. Callers MUST branch on
 *     `hasPin()` before treating a `true` return as authenticated.
 *   - Returns `false` on malformed input or a corrupt record.
 *   - On successful validation of a legacy (unsalted SHA-256) record,
 *     transparently re-hashes the PIN with PBKDF2 and replaces the
 *     stored record. No user action required.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(PIN_KEY);
  const record = parseRecord(raw);
  if (!record) return false;
  const norm = normalizePin(pin);
  if (!norm.ok) return false;
  const ok = await verifyAgainst(record, norm.pin);
  if (!ok) return false;
  if ("legacy" in record) {
    try {
      const upgraded = await hashSecret(norm.pin);
      localStorage.setItem(PIN_KEY, upgraded);
    } catch { /* migration is best-effort; never block a valid unlock */ }
  }
  return true;
}

export function clearPin(): void {
  try { localStorage.removeItem(PIN_KEY); } catch { /* ignore */ }
}


// ---------- Forgot-PIN security question ----------
//
// Recovery is entirely opt-in. There is no built-in question or answer.
// Callers MUST check `hasCustomForgotChallenge()` before offering
// "Forgot PIN?" — `verifyForgotAnswer` refuses to authenticate when no
// challenge is configured.

const FORGOT_Q_KEY = "lumina.privateAlbum.forgotQ";
const FORGOT_A_KEY = "lumina.privateAlbum.forgotAHash";

/** Normalize an answer identically at set-time and verify-time. */
function normalizeAnswer(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Returns the user's configured recovery question, or `null` if none is
 * configured. There is no built-in default.
 */
export function getForgotQuestion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = localStorage.getItem(FORGOT_Q_KEY);
    return q && q.trim().length > 0 ? q : null;
  } catch { return null; }
}

export function hasCustomForgotChallenge(): boolean {
  if (typeof window === "undefined") return false;
  try { return !!localStorage.getItem(FORGOT_Q_KEY) && !!localStorage.getItem(FORGOT_A_KEY); } catch { return false; }
}

export function validateForgotChallenge(question: string, answer: string):
  | { ok: true; question: string; answer: string }
  | { ok: false; error: string }
{
  const q = (question ?? "").trim();
  const a = (answer ?? "").trim();
  if (q.length < 4) return { ok: false, error: "Question must be at least 4 characters" };
  if (q.length > 120) return { ok: false, error: "Question must be at most 120 characters" };
  if (a.length < 1) return { ok: false, error: "Answer cannot be empty" };
  if (a.length > 80) return { ok: false, error: "Answer must be at most 80 characters" };
  return { ok: true, question: q, answer: a };
}

export async function setForgotChallenge(question: string, answer: string): Promise<void> {
  const v = validateForgotChallenge(question, answer);
  if (!v.ok) throw new Error(v.error);
  const record = await hashSecret(normalizeAnswer(v.answer));
  localStorage.setItem(FORGOT_Q_KEY, v.question);
  localStorage.setItem(FORGOT_A_KEY, record);
}

/**
 * Verify a recovery answer against the stored record.
 *
 * Contract:
 *   - Returns `false` when no recovery challenge is configured. There is
 *     no built-in fallback question or answer.
 *   - Returns `false` on empty input or a corrupt record.
 *   - Legacy records (unsalted SHA-256) are validated and transparently
 *     upgraded to PBKDF2 on success.
 */
export async function verifyForgotAnswer(answer: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const norm = normalizeAnswer(answer);
  if (norm.length === 0) return false;
  const raw = localStorage.getItem(FORGOT_A_KEY);
  const record = parseRecord(raw);
  if (!record) return false;
  const ok = await verifyAgainst(record, norm);
  if (!ok) return false;
  if ("legacy" in record) {
    try {
      const upgraded = await hashSecret(norm);
      localStorage.setItem(FORGOT_A_KEY, upgraded);
    } catch { /* best-effort */ }
  }
  return true;
}

export function clearForgotChallenge(): void {
  try {
    localStorage.removeItem(FORGOT_Q_KEY);
    localStorage.removeItem(FORGOT_A_KEY);
  } catch { /* ignore */ }
}


// ---------- Biometric (WebAuthn platform authenticator) ----------

const BIO_KEY = "lumina.privateAlbum.bioCredId";

function b64urlEncode(bytes: Uint8Array): string { return b64url(bytes); }
function b64urlDecode(str: string): Uint8Array { return fromB64url(str); }

export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    if (!("PublicKeyCredential" in window)) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}


export function hasBiometric(): boolean {
  if (typeof window === "undefined") return false;
  try { return !!localStorage.getItem(BIO_KEY); } catch { return false; }
}

export async function enableBiometric(): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Lumina Private Album" },
      user: { id: userId, name: "lumina-local", displayName: "Lumina" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric enrollment cancelled");
  const id = b64urlEncode(new Uint8Array(cred.rawId));
  localStorage.setItem(BIO_KEY, id);
}

export function disableBiometric(): void {
  try { localStorage.removeItem(BIO_KEY); } catch { /* ignore */ }
}

export async function verifyBiometric(): Promise<boolean> {
  try {
    const id = localStorage.getItem(BIO_KEY);
    if (!id) return false;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: b64urlDecode(id).buffer as ArrayBuffer, type: "public-key" }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch { return false; }
}
