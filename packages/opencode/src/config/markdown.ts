import matter from "gray-matter"
import { Filesystem } from "@/util/filesystem"
import { FrontmatterError } from "@opencode-ai/core/v1/config/error"
import { KilocodeMarkdown } from "../kilocode/config/markdown" // kilocode_change

export const FILE_REGEX = /(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g
export const SHELL_REGEX = /!`([^`]+)`/g

export function files(template: string) {
  return Array.from(template.matchAll(FILE_REGEX))
}

export function shell(template: string) {
  return Array.from(template.matchAll(SHELL_REGEX))
}

// other coding agents like claude code allow invalid yaml in their
// frontmatter, we need to fallback to a more permissive parser for those cases
export function fallbackSanitization(content: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return content

  const frontmatter = match[1]
  const lines = frontmatter.split(/\r?\n/)
  const result: string[] = []

  let inMultilineValueKey: string | null = null
  let multilineBuffer: string[] = []

  const flushMultiline = () => {
    if (inMultilineValueKey !== null) {
      const val = multilineBuffer.join(" ")
      // Only quote if it contains a problematic character
      if (val.includes(":") || val.includes("#") || val.match(/^[@%`{\[*&!'"?~-]/) || val.includes('"')) {
        result.push(`${inMultilineValueKey}: "${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      } else {
        result.push(`${inMultilineValueKey}: ${val}`)
      }
      inMultilineValueKey = null
      multilineBuffer = []
    }
  }

  for (const line of lines) {
    // skip comments and empty lines if not in multiline
    if (line.trim().startsWith("#") || line.trim() === "") {
      flushMultiline()
      result.push(line)
      continue
    }

    // handle continuation lines (indented or unindented continuation of plain scalar)
    if (line.match(/^\s+/) && !line.match(/^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:/)) {
      if (inMultilineValueKey !== null) {
        multilineBuffer.push(line.trim())
      } else {
        result.push(line)
      }
      continue
    }

    // match key: value pattern
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
    if (!kvMatch) {
      if (inMultilineValueKey !== null) {
        multilineBuffer.push(line.trim())
      } else {
        result.push(line)
      }
      continue
    }

    // We hit a new key-value pair, flush any active multiline buffer
    flushMultiline()

    const key = kvMatch[1]
    const value = kvMatch[2].trim()

    // skip if value is empty, already quoted, or uses block scalar
    if (value === "" || value === ">" || value === "|" || value === ">-" || value === "|-" || value.startsWith('"') || value.startsWith("'")) {
      result.push(line)
      continue
    }

    // Start a multiline buffer for any plain scalar
    inMultilineValueKey = key
    multilineBuffer.push(value)
  }

  flushMultiline()

  const processed = result.join("\n")
  return content.replace(frontmatter, () => processed)
}

// kilocode_change start - accept source trust and confine untrusted markdown source reads
export async function parse(filePath: string, options: KilocodeMarkdown.Options) {
  const template = options.trusted
    ? await Filesystem.readText(filePath)
    : await KilocodeMarkdown.read(filePath, options)
  // kilocode_change end

  // kilocode_change start - substitute content and retry invalid frontmatter with permissive sanitization
  try {
    const md = matter(template)
    md.content = await KilocodeMarkdown.substitute(md.content, filePath, options) // kilocode_change
    return md
  } catch {
    try {
      const md = matter(fallbackSanitization(template))
      md.content = await KilocodeMarkdown.substitute(md.content, filePath, options) // kilocode_change
      return md
    } catch (err) {
      throw new FrontmatterError(
        {
          path: filePath,
          message: `${filePath}: Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`,
        },
        { cause: err },
      )
    }
  }
  // kilocode_change end
}

// kilocode_change start - export helpers as namespace object
export const ConfigMarkdown = {
  FILE_REGEX,
  SHELL_REGEX,
  files,
  shell,
  fallbackSanitization,
  parse,
}
// kilocode_change end
