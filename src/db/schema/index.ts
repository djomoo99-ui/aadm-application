import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const offices = sqliteTable(
  "offices",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    kind: text("kind", { enum: ["central", "local"] }).notNull().default("local"),
    meetingOrdinal: integer("meeting_ordinal").notNull().default(2),
    meetingWeekday: integer("meeting_weekday").notNull().default(0),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("offices_code_unique").on(table.code),
    index("offices_status_city_idx").on(table.status, table.city),
    check("offices_ordinal_valid", sql`${table.meetingOrdinal} BETWEEN 1 AND 5`),
    check("offices_weekday_valid", sql`${table.meetingWeekday} BETWEEN 0 AND 6`),
  ],
);

export const authUser = sqliteTable(
  "auth_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    phone: text("phone").notNull(),
    memberNumber: text("member_number").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_user_email_unique").on(table.email),
    index("auth_user_member_number_idx").on(table.memberNumber),
  ],
);

export const authSession = sqliteTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("auth_session_token_unique").on(table.token),
    index("auth_session_user_idx").on(table.userId),
    index("auth_session_expires_idx").on(table.expiresAt),
  ],
);

export const authAccount = sqliteTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_account_provider_unique").on(table.providerId, table.accountId),
    index("auth_account_user_idx").on(table.userId),
  ],
);

export const authVerification = sqliteTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("auth_verification_identifier_idx").on(table.identifier)],
);

export const authRateLimit = sqliteTable(
  "auth_rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [uniqueIndex("auth_rate_limit_key_unique").on(table.key)],
);

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    memberId: text("member_id"),
    officeId: text("office_id").notNull().default("office_paris").references(() => offices.id, { onDelete: "restrict" }),
    centralAccess: integer("central_access", { mode: "boolean" }).notNull().default(false),
    phone: text("phone").notNull(),
    status: text("status", { enum: ["pending", "active", "suspended"] })
      .notNull()
      .default("pending"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("profiles_auth_user_id_unique").on(table.authUserId),
    uniqueIndex("profiles_member_id_unique").on(table.memberId),
    index("profiles_phone_idx").on(table.phone),
    index("profiles_status_idx").on(table.status),
    index("profiles_office_idx").on(table.officeId),
  ],
);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    code: text("code", { enum: ["member", "data_entry", "controller", "treasurer", "admin"] }).notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("roles_code_unique").on(table.code)],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    assignedBy: text("assigned_by"),
    assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.roleId] }),
    index("user_roles_role_idx").on(table.roleId),
  ],
);

export const households = sqliteTable(
  "households",
  {
    id: text("id").primaryKey(),
    importCode: text("import_code"),
    officeId: text("office_id").notNull().default("office_paris").references(() => offices.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    phone: text("phone"),
    joinedAt: text("joined_at").notNull(),
    leftAt: text("left_at"),
    status: text("status", { enum: ["active", "inactive", "to_verify"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("households_import_code_unique").on(table.importCode),
    index("households_name_idx").on(table.name),
    index("households_phone_idx").on(table.phone),
    index("households_status_idx").on(table.status),
    index("households_office_idx").on(table.officeId),
  ],
);

export const householdOfficeAssignments = sqliteTable(
  "household_office_assignments",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    officeId: text("office_id").notNull().references(() => offices.id, { onDelete: "restrict" }),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    reason: text("reason").notNull(),
    changedBy: text("changed_by"),
    createdAt: createdAt(),
  },
  (table) => [
    index("household_office_period_idx").on(table.householdId, table.startsAt),
    index("household_office_office_idx").on(table.officeId, table.startsAt),
  ],
);

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    memberNumber: text("member_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    gender: text("gender", { enum: ["male", "female", "unspecified"] })
      .notNull()
      .default("unspecified"),
    birthDate: text("birth_date"),
    phone: text("phone"),
    joinedAt: text("joined_at").notNull(),
    leftAt: text("left_at"),
    status: text("status", { enum: ["active", "inactive", "deceased"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("members_number_unique").on(table.memberNumber),
    index("members_name_idx").on(table.lastName, table.firstName),
    index("members_phone_idx").on(table.phone),
    index("members_status_idx").on(table.status),
  ],
);

export const householdMemberships = sqliteTable(
  "household_memberships",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    relationship: text("relationship", { enum: ["head", "partner", "child"] }).notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("household_memberships_household_idx").on(table.householdId),
    index("household_memberships_member_idx").on(table.memberId),
    uniqueIndex("household_memberships_period_unique").on(
      table.householdId,
      table.memberId,
      table.startsAt,
    ),
  ],
);

export const memberActivityPeriods = sqliteTable(
  "member_activity_periods",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["working", "not_working"] }).notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    reason: text("reason").notNull(),
    changedBy: text("changed_by"),
    createdAt: createdAt(),
  },
  (table) => [
    index("member_activity_periods_member_idx").on(table.memberId, table.startsAt),
    check(
      "member_activity_periods_dates_valid",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`,
    ),
  ],
);

export const contributionRules = sqliteTable(
  "contribution_rules",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["single_man", "single_woman", "couple", "annual_repatriation", "quarterly_working_man"],
    }).notNull(),
    baseAmountCents: integer("base_amount_cents").notNull(),
    femaleAmountCents: integer("female_amount_cents").notNull().default(2000),
    childAmountCents: integer("child_amount_cents").notNull().default(1000),
    childMaxAge: integer("child_max_age").notNull().default(18),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (table) => [
    index("contribution_rules_period_idx").on(table.effectiveFrom, table.effectiveTo),
    index("contribution_rules_category_idx").on(table.category),
    check("contribution_rules_base_non_negative", sql`${table.baseAmountCents} >= 0`),
    check("contribution_rules_female_non_negative", sql`${table.femaleAmountCents} >= 0`),
    check("contribution_rules_child_non_negative", sql`${table.childAmountCents} >= 0`),
    check("contribution_rules_child_age_valid", sql`${table.childMaxAge} BETWEEN 0 AND 30`),
  ],
);

export const ruleDueMonths = sqliteTable(
  "rule_due_months",
  {
    ruleId: text("rule_id")
      .notNull()
      .references(() => contributionRules.id, { onDelete: "cascade" }),
    monthNumber: integer("month_number").notNull(),
    weekdayRule: text("weekday_rule").notNull().default("second_sunday"),
  },
  (table) => [
    primaryKey({ columns: [table.ruleId, table.monthNumber] }),
    check("rule_due_months_valid", sql`${table.monthNumber} BETWEEN 1 AND 12`),
  ],
);

export const householdRuleAssignments = sqliteTable(
  "household_rule_assignments",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => contributionRules.id, { onDelete: "restrict" }),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    overrideAmountCents: integer("override_amount_cents"),
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (table) => [
    index("household_rule_assignments_household_idx").on(table.householdId, table.startsAt),
    check(
      "household_rule_assignments_override_non_negative",
      sql`${table.overrideAmountCents} IS NULL OR ${table.overrideAmountCents} >= 0`,
    ),
  ],
);

export const contributionDues = sqliteTable(
  "contribution_dues",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    officeId: text("office_id").notNull().default("office_paris").references(() => offices.id, { onDelete: "restrict" }),
    memberId: text("member_id").references(() => members.id, { onDelete: "restrict" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => contributionRules.id, { onDelete: "restrict" }),
    dueDate: text("due_date").notNull(),
    contributionKind: text("contribution_kind", {
      enum: ["legacy_household", "annual_repatriation", "quarterly_working_man"],
    }).notNull().default("legacy_household"),
    expectedAmountCents: integer("expected_amount_cents").notNull(),
    childCountSnapshot: integer("child_count_snapshot").notNull().default(0),
    ageSnapshot: integer("age_snapshot"),
    workingSnapshot: integer("working_snapshot", { mode: "boolean" }).notNull().default(false),
    paidAmountCents: integer("paid_amount_cents").notNull().default(0),
    status: text("status", {
      enum: ["upcoming", "partial", "paid", "overdue", "exempt", "to_verify"],
    })
      .notNull()
      .default("upcoming"),
    source: text("source", { enum: ["system", "excel", "notebook"] })
      .notNull()
      .default("system"),
    verifiedAt: text("verified_at"),
    verifiedBy: text("verified_by"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("contribution_dues_member_office_date_kind_unique").on(
      table.memberId,
      table.officeId,
      table.dueDate,
      table.contributionKind,
    ),
    index("contribution_dues_date_status_idx").on(table.dueDate, table.status),
    index("contribution_dues_household_idx").on(table.householdId),
    index("contribution_dues_member_idx").on(table.memberId, table.dueDate),
    index("contribution_dues_office_idx").on(table.officeId, table.dueDate),
    check("contribution_dues_expected_non_negative", sql`${table.expectedAmountCents} >= 0`),
    check("contribution_dues_paid_non_negative", sql`${table.paidAmountCents} >= 0`),
    check("contribution_dues_children_non_negative", sql`${table.childCountSnapshot} >= 0`),
  ],
);

export const associationMeetings = sqliteTable(
  "association_meetings",
  {
    id: text("id").primaryKey(),
    officeId: text("office_id").notNull().default("office_paris").references(() => offices.id, { onDelete: "restrict" }),
    meetingDate: text("meeting_date").notNull(),
    year: integer("year").notNull(),
    monthNumber: integer("month_number").notNull(),
    label: text("label").notNull(),
    status: text("status", { enum: ["scheduled", "completed", "cancelled"] })
      .notNull()
      .default("scheduled"),
    source: text("source", { enum: ["system", "manual"] }).notNull().default("system"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("association_meetings_office_date_unique").on(table.officeId, table.meetingDate),
    index("association_meetings_year_idx").on(table.year, table.meetingDate),
    check("association_meetings_year_valid", sql`${table.year} BETWEEN 2021 AND 2100`),
    check("association_meetings_month_valid", sql`${table.monthNumber} BETWEEN 1 AND 12`),
  ],
);

export const dueGenerationRuns = sqliteTable(
  "due_generation_runs",
  {
    id: text("id").primaryKey(),
    officeId: text("office_id").references(() => offices.id, { onDelete: "restrict" }),
    year: integer("year").notNull(),
    createdDueCount: integer("created_due_count").notNull().default(0),
    skippedDueCount: integer("skipped_due_count").notNull().default(0),
    createdMeetingCount: integer("created_meeting_count").notNull().default(0),
    createdBy: text("created_by").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("due_generation_runs_year_idx").on(table.year, table.createdAt),
    check("due_generation_runs_year_valid", sql`${table.year} BETWEEN 2021 AND 2100`),
    check("due_generation_runs_counts_non_negative", sql`${table.createdDueCount} >= 0 AND ${table.skippedDueCount} >= 0 AND ${table.createdMeetingCount} >= 0`),
  ],
);

export const officeAlerts = sqliteTable(
  "office_alerts",
  {
    id: text("id").primaryKey(),
    officeId: text("office_id").references(() => offices.id, { onDelete: "restrict" }),
    fingerprint: text("fingerprint").notNull(),
    type: text("type", {
      enum: ["pending_access", "household_to_verify", "due_to_verify", "missing_birth_date", "missing_activity_status", "missing_phone", "payment_imbalance", "upcoming_meeting"],
    }).notNull(),
    severity: text("severity", { enum: ["info", "warning", "critical"] }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status", { enum: ["open", "in_review", "resolved"] }).notNull().default("open"),
    source: text("source", { enum: ["scan"] }).notNull().default("scan"),
    lastScanId: text("last_scan_id"),
    firstDetectedAt: text("first_detected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
    resolvedBy: text("resolved_by"),
    resolutionNote: text("resolution_note"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("office_alerts_fingerprint_unique").on(table.fingerprint),
    index("office_alerts_status_severity_idx").on(table.status, table.severity, table.lastSeenAt),
    index("office_alerts_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const alertScanRuns = sqliteTable(
  "alert_scan_runs",
  {
    id: text("id").primaryKey(),
    detectedCount: integer("detected_count").notNull().default(0),
    openedCount: integer("opened_count").notNull().default(0),
    reopenedCount: integer("reopened_count").notNull().default(0),
    autoResolvedCount: integer("auto_resolved_count").notNull().default(0),
    trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull().default("manual"),
    runKey: text("run_key"),
    runBy: text("run_by").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("alert_scan_runs_date_idx").on(table.createdAt),
    uniqueIndex("alert_scan_runs_run_key_unique").on(table.runKey),
    check("alert_scan_runs_counts_non_negative", sql`${table.detectedCount} >= 0 AND ${table.openedCount} >= 0 AND ${table.reopenedCount} >= 0 AND ${table.autoResolvedCount} >= 0`),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    receiptNumber: text("receipt_number").notNull(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    officeId: text("office_id").notNull().default("office_paris").references(() => offices.id, { onDelete: "restrict" }),
    memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    unallocatedAmountCents: integer("unallocated_amount_cents").notNull().default(0),
    paymentDate: text("payment_date").notNull(),
    method: text("method", { enum: ["cash"] }).notNull().default("cash"),
    status: text("status", { enum: ["posted", "reversed"] }).notNull().default("posted"),
    recordedBy: text("recorded_by").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payments_receipt_unique").on(table.receiptNumber),
    uniqueIndex("payments_idempotency_unique").on(table.idempotencyKey),
    index("payments_household_date_idx").on(table.householdId, table.paymentDate),
    index("payments_recorded_by_idx").on(table.recordedBy),
    check("payments_amount_positive", sql`${table.amountCents} > 0`),
    check("payments_unallocated_non_negative", sql`${table.unallocatedAmountCents} >= 0`),
    check("payments_unallocated_not_greater", sql`${table.unallocatedAmountCents} <= ${table.amountCents}`),
  ],
);

export const paymentAllocations = sqliteTable(
  "payment_allocations",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    contributionDueId: text("contribution_due_id")
      .notNull()
      .references(() => contributionDues.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payment_allocations_unique").on(table.paymentId, table.contributionDueId),
    index("payment_allocations_due_idx").on(table.contributionDueId),
    check("payment_allocations_amount_positive", sql`${table.amountCents} > 0`),
  ],
);

export const paymentReversals = sqliteTable(
  "payment_reversals",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    reversedBy: text("reversed_by").notNull(),
    reversedAt: text("reversed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("payment_reversals_payment_unique").on(table.paymentId)],
);

export const memberQrCodes = sqliteTable(
  "member_qr_codes",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
    createdAt: createdAt(),
    revokedAt: text("revoked_at"),
    revokedBy: text("revoked_by"),
  },
  (table) => [
    uniqueIndex("member_qr_codes_token_unique").on(table.tokenHash),
    index("member_qr_codes_member_status_idx").on(table.memberId, table.status),
  ],
);

export const accessRequests = sqliteTable(
  "access_requests",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    memberNumber: text("member_number").notNull(),
    declaredName: text("declared_name").notNull(),
    phone: text("phone").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected", "correction_requested"] })
      .notNull()
      .default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("access_requests_auth_user_unique").on(table.authUserId),
    index("access_requests_status_date_idx").on(table.status, table.createdAt),
    index("access_requests_member_idx").on(table.memberNumber),
  ],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    officeId: text("office_id").notNull().default("office_paris").references(() => offices.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    kind: text("kind", { enum: ["overdue", "upcoming"] }).notNull(),
    periodLabel: text("period_label").notNull(),
    message: text("message").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    status: text("status", { enum: ["prepared", "sent"] }).notNull().default("prepared"),
    createdBy: text("created_by").notNull(),
    sentBy: text("sent_by"),
    idempotencyKey: text("idempotency_key").notNull(),
    sentAt: text("sent_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("reminders_household_date_idx").on(table.householdId, table.createdAt),
    uniqueIndex("reminders_idempotency_unique").on(table.idempotencyKey),
    check("reminders_amount_non_negative", sql`${table.amountCents} >= 0`),
  ],
);

export const imports = sqliteTable(
  "imports",
  {
    id: text("id").primaryKey(),
    fileName: text("file_name").notNull(),
    status: text("status", { enum: ["analysed", "confirmed", "failed"] }).notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    acceptedRows: integer("accepted_rows").notNull().default(0),
    rejectedRows: integer("rejected_rows").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("imports_status_date_idx").on(table.status, table.createdAt),
    check("imports_counts_non_negative", sql`${table.totalRows} >= 0 AND ${table.acceptedRows} >= 0 AND ${table.rejectedRows} >= 0`),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorProfileId: text("actor_profile_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValues: text("old_values", { mode: "json" }),
    newValues: text("new_values", { mode: "json" }),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_actor_date_idx").on(table.actorProfileId, table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const appSettings = sqliteTable(
  "app_settings",
  {
    key: text("key").primaryKey(),
    value: text("value", { mode: "json" }).notNull(),
    updatedBy: text("updated_by"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);
