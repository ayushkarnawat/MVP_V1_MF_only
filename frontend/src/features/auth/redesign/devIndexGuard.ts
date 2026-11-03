/** The dev index page exists only in a development build, and only at this one address. */
export const devIndexEnabled = (isDev: boolean, pathname: string): boolean =>
  isDev && pathname.replace(/\/+$/, "") === "/dev/auth-screens";
