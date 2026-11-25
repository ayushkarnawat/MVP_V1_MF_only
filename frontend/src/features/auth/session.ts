const TOKEN_KEY = "unifolio_session_token";

export interface SignInNotice {
  title: string;
  body: string;
  extra?: string;
}

let signInNotice: string | SignInNotice | null = null;
let tokenOverride: string | null = null;

export function setTokenOverride(token: string | null): void {
  tokenOverride = token;
}

export function getToken(): string | null {
  return tokenOverride ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  signInNotice = null;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function setSignInNotice(notice: string | SignInNotice | null): void {
  signInNotice = notice;
}

export function getSignInNotice(): string | SignInNotice | null {
  return signInNotice;
}
