import { randomBytes, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
export class Auth {
  token: string;
  sessions = new Map<string, number>();
  attempts = new Map<string, { count: number; until: number }>();
  constructor(token = randomBytes(32).toString("base64url")) {
    this.token = token;
  }
  login(token: string) {
    if (
      !this.token ||
      token.length !== this.token.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(this.token))
    )
      return;
    this.token = "";
    const s = randomBytes(32).toString("base64url");
    this.sessions.set(s, Date.now() + 8 * 3600000);
    return s;
  }
  allowed(c: Context) {
    const token = getCookie(c, "wg_session");
    if (!token) return false;
    const expiry = this.sessions.get(token) ?? 0;
    if (expiry < Date.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }
  set(c: Context, s: string) {
    setCookie(c, "wg_session", s, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 8 * 3600,
      secure: new URL(c.req.url).protocol === "https:",
    });
  }
  origin(c: Context) {
    return c.req.header("origin") === new URL(c.req.url).origin;
  }
}
