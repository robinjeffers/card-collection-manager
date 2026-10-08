import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

// --- Better Auth tables (column names must stay camelCase) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  // "admin" | "user". Governs access to account administration.
  role: text("role").notNull().default("user"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Public read-only share links: one active token per collection. Rotating the
// link replaces the row, which invalidates the old URL.
export const shareLink = pgTable("share_link", {
  token: text("token").primaryKey(),
  collectionId: text("collectionId").notNull().unique(),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// One link covering every collection. `scope` is a fixed key so only one row
// can exist; rotating replaces it and invalidates the old URL.
export const shareLibraryLink = pgTable("share_library_link", {
  token: text("token").primaryKey(),
  scope: text("scope").notNull().unique(),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})


export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// --- App tables ---

// A user can own many collections. Each collection's contents (columns, tag
// options, rows) are stored as one JSONB document mirroring the client-side
// Collection shape. Queries are scoped by userId (there is no RLS).
export const collection = pgTable("collection", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})
