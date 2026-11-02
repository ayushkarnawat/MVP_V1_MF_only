const TOKEN_KEY = "unifolio_session_token";
let signInNotice: string | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  signInNotice = null;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function setSignInNotice(notice: string | null): void {
  signInNotice = notice;
}

export function getSignInNotice(): string | null {
  return signInNotice;
}
