import { type Plugin, tool } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, renameSync } from "node:fs"
import { join } from "node:path"

interface DirEntry {
  name: string
  isDir: boolean
}

const ROOT_ENTRIES: string[] = [
  "app", "bin", "config", "database", "docs", "plugins",
  "resources", "routes", "stubs", "tests",
]

// Directories where depth-2 is shown
const SHOW_DEPTH2 = new Set(["app", "resources", "database", "tests", "bin", "routes"])

function scanDirsOnly(dir: string): DirEntry[] {
  try {
    return readdirSync(dir)
      .filter(n => !n.startsWith(".") && statSync(join(dir, n)).isDirectory())
      .sort((a, b) => a.localeCompare(b))
      .map(n => ({ name: n, isDir: true }))
  } catch { return [] }
}

function scanEntries(dir: string): DirEntry[] {
  try {
    return readdirSync(dir)
      .filter(n => !n.startsWith("."))
      .sort((a, b) => a.localeCompare(b))
      .map(n => ({ name: n, isDir: statSync(join(dir, n)).isDirectory() }))
  } catch { return [] }
}

function buildLine(prefix: string, name: string, isLast: boolean, isDir: boolean, comment?: string): string {
  const connector = isLast ? "└── " : "├── "
  const suffix = isDir ? "/" : ""
  const padded = (name + suffix).padEnd(24)
  const commentPart = comment ? ` # ${comment}` : ""
  return `${prefix}${connector}${padded}${commentPart}`
}

function buildTree(projectDir: string, comments: Map<string, string>): string {
  const lines: string[] = []
  lines.push("```")
  lines.push("core/")

  for (let i = 0; i < ROOT_ENTRIES.length; i++) {
    const name = ROOT_ENTRIES[i]
    const isLast = i === ROOT_ENTRIES.length - 1
    const prefix = isLast ? "    " : "│   "
    const isDir = true
    const comment = comments.get(name)
    lines.push(buildLine("", name, isLast, isDir, comment))

    if (name === "plugins") {
      const plugins = scanDirsOnly(join(projectDir, "plugins"))
      if (plugins.length > 0) {
        for (let j = 0; j < plugins.length; j++) {
          const pl = plugins[j]
          const plComment = comments.get(`plugins/${pl.name}`)
          lines.push(buildLine(prefix, pl.name, j === plugins.length - 1, true, plComment))
        }
      }
    } else if (SHOW_DEPTH2.has(name)) {
      const sub = scanEntries(join(projectDir, name))
      if (sub.length > 0) {
        for (let j = 0; j < sub.length; j++) {
          const subEntry = sub[j]
          const subComment = comments.get(`${name}/${subEntry.name}`)
          lines.push(buildLine(prefix, subEntry.name, j === sub.length - 1, subEntry.isDir, subComment))
        }
      }
    }
  }

  lines.push("```")
  return lines.join("\n")
}

function parseExistingTree(content: string): Map<string, string> {
  const comments = new Map<string, string>()
  const dirMapMatch = content.match(/## Directory Map\n\n```\n([\s\S]*?)```/)
  if (!dirMapMatch) return comments

  const treeLines = dirMapMatch[1].split("\n").filter(l => l.trim())
  const depthStack: string[] = []

  for (const line of treeLines) {
    const stripped = line.replace(/^[│\s]*/, "")
    const match = stripped.match(/^[├└]──\s+(.+?)(?:\s+#\s*(.+))?$/)
    if (!match) continue

    const entry = match[1].trim()
    const comment = match[2]?.trim()
    const depth = (line.match(/[│]/g) || []).length

    const name = entry.replace(/\/$/, "")
    depthStack.length = depth
    const path = depthStack.length > 0 ? [...depthStack, name].join("/") : name

    if (comment) comments.set(path, comment)

    depthStack[depth] = name
  }

  return comments
}

function replaceSection(content: string, sectionHeading: string, newContent: string): string {
  const marker = sectionHeading + "\n\n"
  const idx = content.indexOf(marker)
  if (idx === -1) return content

  const before = content.slice(0, idx)
  const after = content.slice(idx + marker.length)

  const openIdx = after.indexOf("```\n")
  if (openIdx === -1) return content

  const closeIdx = after.indexOf("```\n", openIdx + 4)
  if (closeIdx === -1) return content

  const afterSection = after.slice(closeIdx + 4)
  return before + marker + newContent + "\n" + afterSection
}

function getDefaultComments(): Map<string, string> {
  const m = new Map<string, string>()
  m.set("app", "Laravel core")
  m.set("app/Actions", "Single-purpose action classes")
  m.set("app/Console/Commands", "Artisan commands")
  m.set("app/Contracts", "Core interfaces")
  m.set("app/Filament", "Admin panel (Exports, Imports, Pages, Widgets)")
  m.set("app/Http", "Controllers (Api, Web), Middleware, Requests")
  m.set("app/Legacy", "CodeIgniter compatibility (no new code)")
  m.set("app/Libraries", "Legacy libraries")
  m.set("app/Livewire", "Reactive components")
  m.set("app/Models", "Eloquent models")
  m.set("app/Notifications", "Channels, events, dispatchers")
  m.set("app/Providers", "Service providers")
  m.set("app/Services", "Business logic")
  m.set("app/ThirdParty", "Bundled legacy vendor code")
  m.set("bin", "Scripts (test, dev, phpstan-split, etc.)")
  m.set("config", "Laravel + Kama config")
  m.set("database", "Migrations, factories, seeders")
  m.set("docs", "Documentation")
  m.set("plugins", "Independent plugins (each has its own repo, developed here)")
  m.set("resources", "Views, CSS, JS, lang")
  m.set("resources/components", "Blade components (common/, ui/, panel/, profile/)")
  m.set("resources/css", "Stylesheets")
  m.set("resources/js", "JavaScript (app.js, core/, components/, pages/)")
  m.set("resources/views", "Blade templates")
  m.set("resources/lang", "Translation files (fa/, en/)")
  m.set("routes", "Route definitions (web.php, api.php, console.php)")
  m.set("stubs", "Custom Livewire stubs")
  m.set("tests", "Test suites (Feature/, Unit/, e2e/, Support/, Database/)")
  return m
}

function countDiffLines(before: string, after: string): number {
  const bLines = before.split("\n")
  const aLines = after.split("\n")
  let changes = 0
  const maxLen = Math.max(bLines.length, aLines.length)
  for (let i = 0; i < maxLen; i++) {
    if (bLines[i] !== aLines[i]) changes++
  }
  return changes
}

export const DocsStructureSyncPlugin: Plugin = async ({ project }) => {
  const projectDir = project?.path ?? process.cwd()

  return {
    tool: {
      sync_project_structure: tool({
        description:
          "Scan the project directory tree and update docs/PROJECT_STRUCTURE.md with the current structure. " +
          "Preserves all hand-written sections (Rules, Naming, etc.) and existing comments. " +
          "Call after creating new directories, plugins, or restructuring the project.",

        args: {},

        async execute(_args, _ctx) {
          const docPath = join(projectDir, "docs", "PROJECT_STRUCTURE.md")
          if (!existsSync(docPath)) {
            return `File not found: ${docPath}`
          }

          const content = readFileSync(docPath, "utf-8")

          const existingComments = parseExistingTree(content)
          const defaultComments = getDefaultComments()

          // Existing comments take priority over defaults
          const merged = new Map(defaultComments)
          for (const [k, v] of existingComments) {
            if (v) merged.set(k, v)
          }

          const newTree = buildTree(projectDir, merged)
          const updated = replaceSection(content, "## Directory Map", newTree)

          if (updated === content) {
            return "No changes needed — directory map is already up to date."
          }

          const tmp = docPath + ".tmp." + process.pid
          writeFileSync(tmp, updated)
          renameSync(tmp, docPath)

          const diff = countDiffLines(content, updated)
          return `✅ docs/PROJECT_STRUCTURE.md updated (${diff} lines changed). Run \`sync_project_structure\` again after structural changes.`
        },
      }),
    },
  }
}
