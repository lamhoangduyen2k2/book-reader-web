import { sql } from "drizzle-orm";
import { check, index, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
// Profiles Table Schema
export const profiles = pgTable("profiles", {
    id: uuid("id").primaryKey(),
    displayName: varchar("display_name", { length: 100 }),
    role: varchar("role", { enum: ["user", "admin"] }).notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
    check("profiles_role_check", sql`${table.role} in ('user', 'admin')`)
]);
// Books Table Schema
export const books = pgTable("books", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 180 }).notNull(),
    author: varchar("author", { length: 120 }).notNull(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    visibility: varchar("visibility", { enum: ["public", "private"] }).notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
    check("books_visibility_check", sql`${table.visibility} in ('public', 'private')`),
    index("books_owner_id_idx").on(table.ownerId),
    index("books_created_at_idx").on(table.createdAt)
]);
// Infer types for the tables
export type Profile = typeof profiles.$inferSelect;
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;