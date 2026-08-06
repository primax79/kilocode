// kilocode_change - new file
import { test, expect } from "bun:test"
import { Schema } from "effect"
import { Entry, Git, Local } from "../src/config/reference"

test("Config Reference regression: encoding of Entry Union should accept plain objects", () => {
  const data = {
    repository: "github.com/Effect-TS/effect-smol",
    description: "Use for Effect v4 and effect-smol implementation details"
  }
  
  // Decoding must work (returns structured representation)
  const decoded = Schema.decodeUnknownSync(Entry)(data)
  
  // Encoding of decoded objects (even if their prototypes were stripped by utilities like mergeDeep)
  // must succeed and not raise "Expected ConfigV2.Reference.Git"
  const stripped = typeof decoded === "string" ? decoded : { ...(decoded as any) }
  if (typeof stripped !== "string") {
    Object.setPrototypeOf(stripped, Object.prototype) // strip prototype
  }
  
  const encoded = Schema.encodeSync(Entry)(stripped)
  expect(encoded).toEqual(data)
})
