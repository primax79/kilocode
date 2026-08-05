import * as path from "path"
import * as vscode from "vscode"
import type { KiloConnectionService } from "../cli-backend"
import { retry } from "../cli-backend/retry"
import type { MarketplaceService } from "."
import { kebabToTitleCase } from "./api"
import type {
  InstallMarketplaceItemOptions,
  InstallResult,
  MarketplaceDataResponse,
  MarketplaceItem,
  MarketplaceItemRef,
  MarketplaceRepo,
  RemoveResult,
  SkillMarketplaceItem,
} from "./types"

export interface MarketplaceActionContext {
  connection: KiloConnectionService
  marketplace: MarketplaceService
  storage?: vscode.Uri
}

export interface MarketplaceRemoveContext {
  connection: KiloConnectionService
  storage?: vscode.Uri
  remove: (item: MarketplaceItemRef, scope: "project" | "global", project?: string) => Promise<RemoveResult>
}

export async function fetchMarketplaceData(
  ctx: MarketplaceActionContext,
  project: string | undefined,
  dir: string | undefined,
  roots: readonly vscode.Uri[],
): Promise<MarketplaceDataResponse> {
  const skills = dir ? await fetchSkills(ctx, dir) : undefined
  const [data, marketplaces] = await Promise.all([
    ctx.marketplace.fetchData(project, skills, roots),
    fetchConfiguredMarketplaces(ctx, dir),
  ])
  const { items: customItems, errors: customErrors } = await fetchCustomMarketplaceSkills(marketplaces)
  return {
    ...data,
    marketplaceItems: [...data.marketplaceItems, ...customItems],
    errors: customErrors.length > 0 ? [...(data.errors ?? []), ...customErrors] : data.errors,
    marketplaces,
  }
}

// Derives the raw marketplace-skills.json URL for a configured source from
// its git remote URL (the same shape kilo-plugin-manager's
// generate_skill_marketplace.py computes owner/repo from) - only GitHub
// remotes are supported for now, matching what that script itself targets.
function githubRawFeedUrl(gitUrl: string): string | undefined {
  const m = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(gitUrl.trim())
  if (!m) return undefined
  const [, owner, repo] = m
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/marketplace-skills.json`
}

interface RawFeedSkill {
  id: string
  description: string
  category: string
  githubUrl: string
  // Exactly one of the two - see installer.ts's installSkill() for which
  // install path each takes.
  content?: string
  files?: string[]
}

function transformFeedSkill(raw: RawFeedSkill, marketplace: string): SkillMarketplaceItem {
  const display = kebabToTitleCase(raw.id)
  return {
    type: "skill",
    id: raw.id,
    name: display,
    displayName: display,
    description: raw.description,
    category: raw.category,
    displayCategory: kebabToTitleCase(raw.category),
    githubUrl: raw.githubUrl,
    content: raw.content,
    files: raw.files,
    marketplace,
  }
}

// Fetches each configured source's self-hosted marketplace-skills.json feed
// (see kilo-plugin-manager's SKILL.md §4) - a plain HTTP GET, no git clone.
// Skill entries carry either `content` (a tarball URL, fetched as-is by the
// existing installer) or `files` (a flat file list, fetched individually -
// see installer.ts's downloadSkillFiles()); no local-path install problem
// either way, since both name real hosted URLs. One marketplace failing to
// fetch/parse never blocks the others.
async function fetchCustomMarketplaceSkills(
  marketplaces: MarketplaceRepo[],
): Promise<{ items: SkillMarketplaceItem[]; errors: string[] }> {
  const items: SkillMarketplaceItem[] = []
  const errors: string[] = []

  await Promise.all(
    marketplaces
      .filter((m) => m.enabled !== false)
      .map(async (m) => {
        const feedUrl = githubRawFeedUrl(m.url)
        if (!feedUrl) return
        try {
          const response = await fetch(feedUrl)
          if (!response.ok) {
            if (response.status !== 404) errors.push(`Failed to fetch marketplace "${m.name}": HTTP ${response.status}`)
            return
          }
          const parsed = (await response.json()) as { items?: RawFeedSkill[] }
          for (const raw of parsed.items ?? []) items.push(transformFeedSkill(raw, m.name))
        } catch (err) {
          errors.push(`Failed to fetch marketplace "${m.name}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
  )

  return { items, errors }
}

// Reads kilo.json's `marketplaces` (global+project merged, same precedence as
// everything else in Config.Info) via the CLI client - kept out of
// MarketplaceService, which has no config awareness, and out of the webview,
// which would otherwise need ConfigProvider (unavailable in the standalone
// Marketplace panel's dedicated, deliberately lean webview root).
async function fetchConfiguredMarketplaces(
  ctx: MarketplaceActionContext,
  dir: string | undefined,
): Promise<MarketplaceRepo[]> {
  if (!dir) return []
  try {
    const client = await ctx.connection.getClientAsync(dir)
    const { data } = await retry(() => client.config.get({ directory: dir }, { throwOnError: true }))
    return data.marketplaces ?? []
  } catch (err) {
    console.warn("[Kilo New] Failed to fetch configured marketplaces:", err)
    return []
  }
}

export async function installMarketplaceItem(
  ctx: MarketplaceActionContext,
  item: MarketplaceItem,
  opts: InstallMarketplaceItemOptions,
  project: string | undefined,
  dir: string,
): Promise<InstallResult> {
  const scope = opts.target ?? "project"
  if (scope === "project" && !project) {
    return { success: false, slug: item.id, error: "No workspace directory for project-scope install" }
  }

  try {
    const result = await ctx.marketplace.install(item, opts, project)
    if (result.success) await invalidate(ctx, scope, scope === "project" ? project! : dir)
    return result
  } catch (err) {
    return { success: false, slug: item.id, error: String(err) }
  }
}

export async function removeMarketplaceItem(
  ctx: MarketplaceActionContext,
  item: MarketplaceItem,
  scope: "project" | "global",
  project: string | undefined,
  dir: string,
): Promise<RemoveResult> {
  if (scope === "project" && !project) {
    return { success: false, slug: item.id, error: "No workspace directory for project-scope removal" }
  }

  try {
    if (item.type === "mcp") await removeLegacyMcp(ctx, item.id, project, scope)
    const result = await ctx.marketplace.remove(item, scope, project)
    if (result.success) await invalidate(ctx, scope, scope === "project" ? project! : dir)
    return result
  } catch (err) {
    return { success: false, slug: item.id, error: String(err) }
  }
}

export async function removeMarketplaceItemFromAllScopes(
  ctx: MarketplaceRemoveContext,
  item: MarketplaceItemRef,
  project: string | undefined,
  dir: string,
): Promise<boolean> {
  try {
    if (item.type === "mcp") await removeLegacyMcp(ctx, item.id, project, "all")
    const local = project ? await ctx.remove(item, "project", project) : undefined
    const global = await ctx.remove(item, "global", project)
    if (!local?.success && !global.success) return false
    await invalidate(ctx, global.success ? "global" : "project", global.success ? dir : project!)
    return true
  } catch (err) {
    console.warn("[Kilo New] Marketplace removal failed:", err)
    return false
  }
}

async function fetchSkills(ctx: MarketplaceActionContext, dir: string) {
  try {
    const client = await ctx.connection.getClientAsync(dir)
    const { data } = await retry(() => client.app.skills({ directory: dir }, { throwOnError: true }))
    return data
  } catch (err) {
    console.warn("[Kilo New] Failed to fetch CLI skills for marketplace:", err)
    return undefined
  }
}

async function invalidate(
  ctx: { connection: KiloConnectionService },
  scope: "project" | "global",
  dir: string,
): Promise<void> {
  const client = await ctx.connection.getClientAsync(dir).catch((err: unknown) => {
    console.warn("[Kilo New] Marketplace CLI invalidation deferred:", err)
    return null
  })
  if (!client) return

  if (scope === "global") {
    await client.global.config.update({ config: {} }).catch((err: unknown) => {
      console.warn("[Kilo New] global.config.update after marketplace change failed:", err)
    })
  }
  await client.instance.dispose({ directory: dir }).catch((err: unknown) => {
    console.warn("[Kilo New] instance.dispose() after marketplace change failed:", err)
  })
}

async function removeLegacyMcp(
  ctx: { storage?: vscode.Uri },
  name: string,
  project: string | undefined,
  scope: "project" | "global" | "all",
): Promise<boolean> {
  const files: vscode.Uri[] = []
  if (project && scope !== "global") {
    files.push(vscode.Uri.file(path.join(project, ".kilo", "mcp.json")))
    files.push(vscode.Uri.file(path.join(project, ".kilocode", "mcp.json")))
  }

  if (ctx.storage && scope !== "project") files.push(vscode.Uri.joinPath(ctx.storage, "settings", "mcp_settings.json"))

  let removed = false
  for (const uri of files) {
    const bytes = await vscode.workspace.fs.readFile(uri).then(
      (data) => data,
      () => null,
    )
    if (!bytes) continue

    try {
      const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>
      const servers = parsed.mcpServers as Record<string, unknown> | undefined
      if (!servers?.[name]) continue
      delete servers[name]
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(parsed, null, 2), "utf8"))
      removed = true
    } catch (err) {
      console.warn("[Kilo New] Failed to remove legacy MCP from", uri.fsPath, err)
    }
  }
  return removed
}
