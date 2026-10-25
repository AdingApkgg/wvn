import { brand } from "../brand";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { passkey } from "@better-auth/passkey";
import type { AccountConfig } from "./config.server.ts";
export const RECENT_MS = 10 * 60_000;
export const ABSOLUTE_MS = 90 * 86400_000;
export function secureEqual(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function invalid(message = "Passkey verification failed"): never {
  throw new APIError("BAD_REQUEST", { code: "PASSKEY_INVALID", message });
}
export function makeAuth(
  db: DatabaseSync,
  config: AccountConfig,
  isDeleted: (id: string) => boolean = () => false,
) {
  return betterAuth({
    appName: brand.title,
    baseURL: config.origin,
    secret: config.secret,
    database: db,
    trustedOrigins: [config.origin],
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 30 * 86400,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { enabled: false } },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-wg-client-ip"] },
      useSecureCookies: true,
      cookiePrefix: config.cookiePrefix ?? "__Host-wg",
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 40 },
    logger: { disabled: true },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            db.prepare(
              "INSERT OR IGNORE INTO wg_account(user_id,auth_version,code_group) VALUES (?,0,'')",
            ).run(user.id);
          },
        },
      },
      session: {
        create: {
          before: async (data) => {
            if (isDeleted(data.userId)) invalid("Account has been deleted");
            return {
              data: {
                ...data,
                userAgent:
                  typeof data.userAgent === "string"
                    ? data.userAgent.slice(0, 512)
                    : null,
              },
            };
          },
          after: async (created, ctx) => {
            if (!ctx) return;
            const previous = await ctx.getSignedCookie(
              ctx.context.authCookies.sessionToken.name,
              ctx.context.secret,
            );
            if (previous && previous !== created.token)
              await ctx.context.internalAdapter.deleteSession(previous);
          },
        },
      },
    },
    plugins: [
      passkey({
        rpID: new URL(config.origin).hostname,
        rpName: brand.title,
        origin: config.origin,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        registration: {
          requireSession: false,
          resolveUser: async ({ context }) => {
            const input = JSON.parse(context ?? "{}");
            if (
              input.intent !== "signup" ||
              typeof input.name !== "string" ||
              typeof input.id !== "string"
            )
              invalid();
            return { id: input.id, name: input.name, displayName: input.name };
          },
          afterVerification: async ({ ctx, verification, user, context }) => {
            if (
              Number(
                db
                  .prepare("SELECT count(*) AS n FROM passkey WHERE userId=?")
                  .get(user.id)?.n,
              ) >= 50
            )
              invalid("Passkey limit reached");
            if (!verification.registrationInfo?.userVerified)
              invalid("User verification is required");
            if (ctx.body?.createSession !== true)
              invalid("Session creation is required");
            if (
              ctx.body?.name !== undefined &&
              (typeof ctx.body.name !== "string" ||
                [...ctx.body.name].length > 64 ||
                /[\p{Cc}\p{Cf}]/u.test(ctx.body.name))
            )
              invalid("Invalid passkey name");
            const input = JSON.parse(context ?? "{}");
            if (input.intent === "signup") {
              if (ctx.context.session?.user || input.id !== user.id) invalid();
              const created = await ctx.context.internalAdapter.createUser(
                {
                  id: user.id,
                  name: user.name,
                  email: `${user.id}@placeholder.invalid`,
                  emailVerified: false,
                },
                { method: "passkey" },
              );
              return { userId: created.id, name: "我的通行密钥" };
            }
            const session = ctx.context.session;
            const state = db
              .prepare("SELECT auth_version FROM wg_account WHERE user_id=?")
              .get(user.id);
            if (
              input.intent !== "add" ||
              !session ||
              session.user.id !== user.id ||
              session.session.id !== input.sessionId ||
              state?.auth_version !== input.version ||
              Date.now() - new Date(session.session.createdAt).getTime() >
                RECENT_MS
            )
              invalid("Sign in again to add a passkey");
            db.prepare(
              "UPDATE wg_account SET auth_version=auth_version+1 WHERE user_id=?",
            ).run(user.id);
            return { name: "备用通行密钥" };
          },
        },
        authentication: {
          afterVerification: async ({ verification }) => {
            if (!verification.authenticationInfo.userVerified)
              invalid("User verification is required");
          },
        },
      }),
    ],
  });
}
export type AccountAuth = ReturnType<typeof makeAuth>;
export type PlayerSession = AccountAuth["$Infer"]["Session"];
export function newUserId() {
  return randomUUID();
}
