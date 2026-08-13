import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";

import * as schema from "./db/schema";

export type AuthBindings = {
  APP_ENV?: string;
  AUTH_SECRET: string;
  DB: D1Database;
  QR_TOKEN_SECRET: string;
};

const memberNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9-]+$/);

const phoneSchema = z.string().trim().min(8).max(25).regex(/^\+?[0-9 ]+$/);

export function createAuth(env: AuthBindings, request: Request) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET doit contenir au moins 32 caractères.");
  }
  if (!env.QR_TOKEN_SECRET || env.QR_TOKEN_SECRET.length < 32) {
    throw new Error("QR_TOKEN_SECRET doit contenir au moins 32 caractères.");
  }

  const database = drizzle(env.DB, { schema });
  const origin = new URL(request.url).origin;

  return betterAuth({
    appName: "AADM",
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.AUTH_SECRET,
    trustedOrigins: [origin],
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    user: {
      modelName: "authUser",
      additionalFields: {
        phone: { type: "string", required: true, input: true },
        memberNumber: { type: "string", required: true, input: true },
      },
    },
    session: {
      modelName: "authSession",
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60,
    },
    account: { modelName: "authAccount" },
    verification: {
      modelName: "authVerification",
      storeIdentifier: "hashed",
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // Une réponse générique évite de révéler si une adresse possède déjà un compte.
      autoSignIn: false,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "authRateLimit",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 3 },
      },
    },
    advanced: {
      cookiePrefix: "aadm",
      useSecureCookies: origin.startsWith("https://"),
      // Cloudflare remplace ce champ à la périphérie : le navigateur ne peut pas
      // choisir l'adresse utilisée pour la limitation des tentatives.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const phone = phoneSchema.safeParse(user.phone);
            const memberNumber = memberNumberSchema.safeParse(user.memberNumber);

            if (!phone.success || !memberNumber.success) {
              throw new APIError("BAD_REQUEST", {
                message: "Le téléphone ou le numéro de membre n’est pas valide.",
              });
            }

            return {
              data: {
                ...user,
                name: user.name.trim(),
                phone: phone.data.replace(/\s+/g, ""),
                memberNumber: memberNumber.data.toUpperCase(),
              },
            };
          },
          after: async (user) => {
            const phone = String(user.phone);
            const memberNumber = String(user.memberNumber);
            const profileId = `profile_${user.id}`;

            await env.DB.batch([
              env.DB.prepare(
                `INSERT INTO profiles (id, auth_user_id, phone, status)
                 VALUES (?, ?, ?, 'pending')`,
              ).bind(profileId, user.id, phone),
              env.DB.prepare(
                `INSERT INTO access_requests
                  (id, auth_user_id, member_number, declared_name, phone, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
              ).bind(crypto.randomUUID(), user.id, memberNumber, user.name, phone),
            ]);
          },
        },
      },
    },
  });
}
