import path from "node:path"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { Global } from "@opencode-ai/core/global"
import { Process } from "@/util/process"
import z from "zod"

export namespace Marketplace {
  export const ConfigEntry = z.object({
    name: z.string(),
    url: z.string(),
    enabled: z.boolean().optional().default(true),
  })
  export type ConfigEntry = z.infer<typeof ConfigEntry>

  export const ScopedConfigEntry = ConfigEntry.extend({
    scope: z.enum(["global", "project"]),
    isInherited: z.boolean().optional(),
  })
  export type ScopedConfigEntry = z.infer<typeof ScopedConfigEntry>

  /**
   * Merge Global and Project marketplace lists following VS Code hierarchy.
   * Project entries override Global entries with matching names.
   */
  export function mergeConfigEntries(
    globalEntries: ConfigEntry[] = [],
    projectEntries: ConfigEntry[] = [],
  ): ScopedConfigEntry[] {
    const map = new Map<string, ScopedConfigEntry>()

    for (const g of globalEntries) {
      map.set(g.name, { ...g, scope: "global" })
    }

    for (const p of projectEntries) {
      const existing = map.get(p.name)
      if (existing) {
        // Project overrides global entry
        map.set(p.name, {
          ...existing,
          ...p,
          scope: "project",
          isInherited: true,
        })
      } else {
        map.set(p.name, { ...p, scope: "project" })
      }
    }

    return Array.from(map.values())
  }

  // `category` is required, matching the official marketplace's own MarketplaceItemBase
  // contract (packages/kilo-vscode/src/services/marketplace/types.ts) - the UI's category
  // filter buttons assume every item has one. Unlike `type` (which the official feed
  // determines by *which* of three separate endpoints/manifests answered, not a field -
  // see docs/specs/multi-repo-marketplace.md's "Constraints" section), `category` is a
  // flat author-declared field there and is kept the same shape here.
  export const ManifestPlugin = z.object({
    name: z.string(),
    description: z.string().optional(),
    category: z.string(),
    source: z.string(),
  })
  export type ManifestPlugin = z.infer<typeof ManifestPlugin>

  export const Manifest = z.object({
    name: z.string(),
    description: z.string().optional(),
    version: z.string().optional(),
    plugins: z.array(ManifestPlugin).default([]),
  })
  export type Manifest = z.infer<typeof Manifest>

  export const ResolvedPlugin = z.object({
    marketplace: z.string(),
    name: z.string(),
    qualifiedName: z.string(), // e.g. "db-tools@official"
    description: z.string().optional(),
    category: z.string(),
    sourcePath: z.string(), // Absolute local path to plugin source
  })
  export type ResolvedPlugin = z.infer<typeof ResolvedPlugin>

  /** Absolute path where marketplace clones are stored (~/.kilo/marketplaces or ~/.local/share/kilo/marketplaces) */
  export function storageDir(): string {
    return path.join(Global.Path.data, "marketplaces")
  }

  /**
   * Parse a marketplace manifest from a folder.
   * Checks `.kilo/marketplace.json` then `marketplace.json`.
   */
  export async function parseManifest(dir: string): Promise<Manifest | null> {
    const candidates = [
      path.join(dir, ".kilo", "marketplace.json"),
      path.join(dir, "marketplace.json"),
    ]
    for (const file of candidates) {
      if (existsSync(file)) {
        try {
          const content = await fs.readFile(file, "utf-8")
          const json = JSON.parse(content)
          return Manifest.parse(json)
        } catch {
          // ignore or continue
        }
      }
    }
    return null
  }

  /**
   * Sync (clone or pull) a git-based marketplace or return directory path if local folder.
   */
  export async function syncMarketplace(entry: ConfigEntry): Promise<string> {
    const isLocalDir = entry.url.startsWith("/") || entry.url.startsWith("file://") || entry.url.startsWith(".")
    if (isLocalDir) {
      const localPath = entry.url.startsWith("file://") ? entry.url.slice(7) : entry.url
      if (!existsSync(localPath)) {
        throw new Error(`Local marketplace directory does not exist: ${localPath}`)
      }
      return localPath
    }

    const targetDir = path.join(storageDir(), entry.name)
    await fs.mkdir(storageDir(), { recursive: true })

    if (existsSync(path.join(targetDir, ".git"))) {
      // Pull latest
      try {
        await Process.spawn(["git", "-C", targetDir, "pull", "--ff-only"])
      } catch (err) {
        // Fallback or ignore fetch errors when offline
      }
    } else {
      // Clone repo
      await Process.spawn(["git", "clone", "--depth", "1", entry.url, targetDir])
    }

    return targetDir
  }

  /**
   * Resolve plugins from configured marketplaces according to priority order.
   */
  export async function resolvePlugins(marketplaces: ConfigEntry[]): Promise<ResolvedPlugin[]> {
    const active = marketplaces.filter((m) => m.enabled !== false)
    const pluginsMap = new Map<string, ResolvedPlugin>()

    for (const repo of active) {
      try {
        const repoDir = await syncMarketplace(repo)
        const manifest = await parseManifest(repoDir)
        if (!manifest) continue

        for (const p of manifest.plugins) {
          const qualifiedName = `${p.name}@${repo.name}`
          const sourcePath = path.isAbsolute(p.source) ? p.source : path.join(repoDir, p.source)

          const resolved: ResolvedPlugin = {
            marketplace: repo.name,
            name: p.name,
            qualifiedName,
            description: p.description,
            category: p.category,
            sourcePath,
          }

          // Register qualified name
          pluginsMap.set(qualifiedName, resolved)

          // First marketplace in the list wins for unqualified name alias
          if (!pluginsMap.has(p.name)) {
            pluginsMap.set(p.name, {
              ...resolved,
              qualifiedName: p.name,
            })
          }
        }
      } catch {
        // Continue if one marketplace syncs/parses fails
      }
    }

    return Array.from(pluginsMap.values())
  }
}
