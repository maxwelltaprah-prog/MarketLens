import {
  pgTable, pgEnum, uuid, text, boolean, integer, timestamp, date, numeric, jsonb, doublePrecision, real,
  primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['admin', 'promoter'])
export const entryStatusEnum = pgEnum('entry_status', ['draft', 'submitted'])

export const outlets = pgTable('outlets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  region: text('region').notNull(),
  lat: doublePrecision('lat'),          // outlet pin, for geofencing (optional)
  lng: doublePrecision('lng'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('outlets_name_uq').on(t.name)])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: roleEnum('role').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  secretHash: text('secret_hash').notNull(), // bcrypt of password (admin) or PIN (promoter)
  outletId: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  tokenVersion: integer('token_version').notNull().default(0), // bump to revoke every session for this user
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_uq').on(t.email),
  uniqueIndex('users_phone_uq').on(t.phone),
])

export const skus = pgTable('skus', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),      // e.g. "5 kg"
  code: text('code').notNull(),        // short badge text, e.g. "5"
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('skus_label_uq').on(t.label)])

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  isCompany: boolean('is_company').notNull().default(false), // Olam Agri brand (sales are recorded) vs competitor (prices only)
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('brands_name_uq').on(t.name)])

export const skuBrands = pgTable('sku_brands', {
  skuId: uuid('sku_id').notNull().references(() => skus.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.skuId, t.brandId] })])

export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  promoterId: uuid('promoter_id').notNull().references(() => users.id),
  entryDate: date('entry_date').notNull(),
  status: entryStatusEnum('status').notNull().default('draft'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  // Geofence result at submission: 'ok' (within radius), 'away', 'unverified' (outlet has no pin), 'none' (no location shared)
  geoStatus: text('geo_status'),
  geoDistanceM: integer('geo_distance_m'),
  geoLat: doublePrecision('geo_lat'),
  geoLng: doublePrecision('geo_lng'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('entries_outlet_date_uq').on(t.outletId, t.entryDate),
  index('entries_date_idx').on(t.entryDate),
  index('entries_promoter_idx').on(t.promoterId),
])

export const entryPrices = pgTable('entry_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  skuId: uuid('sku_id').notNull().references(() => skus.id),
  brandId: uuid('brand_id').notNull().references(() => brands.id),
  price: numeric('price', { precision: 12, scale: 2 }),
  notAvailable: boolean('not_available').notNull().default(false),
}, (t) => [
  uniqueIndex('entry_prices_uq').on(t.entryId, t.skuId, t.brandId),
  index('entry_prices_sku_brand_idx').on(t.skuId, t.brandId),
])

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
})

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_created_idx').on(t.createdAt)])

/** Sign-in attempts by IP, for cross-instance rate limiting on Vercel. Pruned automatically. */
export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ip: text('ip').notNull(),
  identifier: text('identifier'),
  success: boolean('success').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('login_attempts_ip_idx').on(t.ip, t.createdAt)])

/** Location pings from the field app: sign-in, autosave, submit and periodic heartbeats while the capture screen is open.
 * Pruned after `locationRetentionDays` (default 90). */
export const locationPings = pgTable('location_pings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                 // login | heartbeat | save | submit
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  accuracyM: real('accuracy_m'),
  speedMps: real('speed_mps'),
  headingDeg: real('heading_deg'),
  altitudeM: real('altitude_m'),
  outletId: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
  entryId: uuid('entry_id').references(() => entries.id, { onDelete: 'set null' }),
  distanceM: integer('distance_m'),             // to the outlet pin, when known
  battery: real('battery'),                     // 0..1 if the device reports it
  online: boolean('online'),                    // false when captured offline and synced later
  ip: text('ip'),
  userAgent: text('user_agent'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),   // device time of the fix
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('location_pings_user_time_idx').on(t.userId, t.capturedAt),
  index('location_pings_entry_idx').on(t.entryId),
  index('location_pings_time_idx').on(t.capturedAt),
])

/** Daily sales recorded by promoters for company brands. One row per outlet × day × SKU × brand (upserted). */
export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  promoterId: uuid('promoter_id').notNull().references(() => users.id),
  saleDate: date('sale_date').notNull(),
  skuId: uuid('sku_id').notNull().references(() => skus.id),
  brandId: uuid('brand_id').notNull().references(() => brands.id),
  quantity: integer('quantity').notNull().default(0),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }),   // optional selling price, enables revenue
  note: text('note'),
  geoLat: doublePrecision('geo_lat'),
  geoLng: doublePrecision('geo_lng'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sales_uq').on(t.outletId, t.saleDate, t.skuId, t.brandId),
  index('sales_date_idx').on(t.saleDate),
  index('sales_brand_idx').on(t.brandId, t.skuId),
])
