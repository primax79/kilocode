export * as ConfigReference from "./reference"

import { Schema } from "effect"

// kilocode_change start
export const Git = Schema.Struct({
  repository: Schema.String,
  branch: Schema.String.pipe(Schema.optional),
  description: Schema.String.pipe(Schema.optional),
  hidden: Schema.Boolean.pipe(Schema.optional),
}).annotate({ identifier: "ConfigV2.Reference.Git" })

export type Git = Schema.Schema.Type<typeof Git>

export const Local = Schema.Struct({
  path: Schema.String,
  description: Schema.String.pipe(Schema.optional),
  hidden: Schema.Boolean.pipe(Schema.optional),
}).annotate({ identifier: "ConfigV2.Reference.Local" })

export type Local = Schema.Schema.Type<typeof Local>
// kilocode_change end

export const Entry = Schema.Union([Schema.String, Git, Local])
export type Entry = typeof Entry.Type

export const Info = Schema.Record(Schema.String, Entry)
export type Info = typeof Info.Type
