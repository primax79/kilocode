import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import { Marketplace } from "@/kilocode/marketplace"

describe("Marketplace module", () => {
  test("parseManifest parses .kilo/marketplace.json and root marketplace.json", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-mp-test-"))
    try {
      const kiloDir = path.join(tmpDir, ".kilo")
      await fs.mkdir(kiloDir, { recursive: true })
      
      const manifestData = {
        name: "test-marketplace",
        description: "Test marketplace description",
        version: "1.0.0",
        plugins: [
          {
            name: "db-tools",
            description: "Database tools plugin",
            category: "data",
            source: "./plugins/db-tools",
          },
        ],
      }

      await fs.writeFile(path.join(kiloDir, "marketplace.json"), JSON.stringify(manifestData), "utf-8")

      const parsed = await Marketplace.parseManifest(tmpDir)
      expect(parsed).not.toBeNull()
      expect(parsed?.name).toBe("test-marketplace")
      expect(parsed?.plugins.length).toBe(1)
      expect(parsed?.plugins[0].name).toBe("db-tools")
      expect(parsed?.plugins[0].category).toBe("data")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("resolvePlugins respects marketplace priority and qualified names", async () => {
    const tmpDir1 = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-mp-repo1-"))
    const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-mp-repo2-"))

    try {
      await fs.writeFile(
        path.join(tmpDir1, "marketplace.json"),
        JSON.stringify({
          name: "official",
          plugins: [
            { name: "shared-tool", description: "Official version", source: "./shared" },
            { name: "official-only", source: "./official" },
          ],
        }),
      )

      await fs.writeFile(
        path.join(tmpDir2, "marketplace.json"),
        JSON.stringify({
          name: "team-internal",
          plugins: [
            { name: "shared-tool", description: "Internal version", source: "./shared" },
            { name: "internal-only", source: "./internal" },
          ],
        }),
      )

      const config: Marketplace.ConfigEntry[] = [
        { name: "official", url: tmpDir1, enabled: true },
        { name: "team-internal", url: tmpDir2, enabled: true },
      ]

      const resolved = await Marketplace.resolvePlugins(config)

      const resolvedMap = new Map(resolved.map((p) => [p.qualifiedName, p]))
      const unqualifiedMap = new Map(resolved.filter((p) => !p.qualifiedName.includes("@")).map((p) => [p.name, p]))

      expect(resolvedMap.has("shared-tool@official")).toBe(true)
      expect(resolvedMap.has("shared-tool@team-internal")).toBe(true)

      // Unqualified name priority: first marketplace ("official") wins
      const unqualifiedShared = unqualifiedMap.get("shared-tool")
      expect(unqualifiedShared?.marketplace).toBe("official")
      expect(unqualifiedShared?.description).toBe("Official version")
    } finally {
      await fs.rm(tmpDir1, { recursive: true, force: true })
      await fs.rm(tmpDir2, { recursive: true, force: true })
    }
  })

  test("mergeConfigEntries merges global and project entries with override scope", () => {
    const globalEntries: Marketplace.ConfigEntry[] = [
      { name: "official", url: "https://github.com/Kilo-Org/kilo-marketplace.git", enabled: true },
      { name: "personal-tools", url: "git@github.com:user/my-tools.git", enabled: true },
    ]

    const projectEntries: Marketplace.ConfigEntry[] = [
      { name: "project-internal", url: "git@gitea.mycompany.org:project/marketplace.git", enabled: true },
      { name: "personal-tools", url: "git@github.com:user/my-tools.git", enabled: false },
    ]

    const merged = Marketplace.mergeConfigEntries(globalEntries, projectEntries)

    expect(merged.length).toBe(3)
    
    const official = merged.find((m) => m.name === "official")
    expect(official?.scope).toBe("global")
    expect(official?.enabled).toBe(true)

    const personal = merged.find((m) => m.name === "personal-tools")
    expect(personal?.scope).toBe("project")
    expect(personal?.isInherited).toBe(true)
    expect(personal?.enabled).toBe(false) // Project explicitly disabled it

    const projectInternal = merged.find((m) => m.name === "project-internal")
    expect(projectInternal?.scope).toBe("project")
    expect(projectInternal?.enabled).toBe(true)
  })
})
