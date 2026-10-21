import { type Plugin, tool } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs"
import { join } from "node:path"

interface SessionEntry {
  pid: number
  startedAt: string
  lastHeartbeat: string
  title: string
  scope: string
  branch: string
  sessionID: string
}

const SESSIONS_FILE = ".opencode/sessions.json"
const HEARTBEAT_STALE_MS = 150_000

export const SessionCoordinatorPlugin: Plugin = async ({ project, $ }) => {
  const projectDir = project?.path ?? process.cwd()
  const sessionsPath = join(projectDir, SESSIONS_FILE)

  function read(): SessionEntry[] {
    try {
      return JSON.parse(readFileSync(sessionsPath, "utf-8"))
    } catch {
      return []
    }
  }

  function write(sessions: SessionEntry[]) {
    const dir = join(projectDir, ".opencode")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = sessionsPath + ".tmp." + process.pid
    writeFileSync(tmp, JSON.stringify(sessions, null, 2))
    renameSync(tmp, sessionsPath)
  }

  function cleanStale(sessions: SessionEntry[]): SessionEntry[] {
    const now = Date.now()
    return sessions.filter(s => now - new Date(s.lastHeartbeat).getTime() < HEARTBEAT_STALE_MS)
  }

  async function getCurrentBranch(): Promise<string> {
    try {
      const r = await $`git rev-parse --abbrev-ref HEAD 2>/dev/null`.quiet().nothrow()
      return r.stdout.trim() || "unknown"
    } catch {
      return "unknown"
    }
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const branch = await getCurrentBranch()
        const sessions = cleanStale(read())
        sessions.push({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          title: event.properties.info.title || branch,
          scope: "",
          branch,
          sessionID: event.properties.info.id,
        })
        write(sessions)
      }

      if (event.type === "session.deleted") {
        const sessions = cleanStale(read())
        write(sessions.filter(s => s.sessionID !== event.properties.info.id))
      }
    },

    "tool.execute.before": async (_input, _output) => {
      const sessions = read()
      const idx = sessions.findIndex(s => s.pid === process.pid)
      if (idx !== -1) {
        sessions[idx].lastHeartbeat = new Date().toISOString()
      }
      write(cleanStale(sessions))
    },

    tool: {
      check_sessions: tool({
        description: "List all active opencode sessions on this project. Check before starting a task to avoid editing the same files as another session.",
        args: {},
        async execute(_args, _ctx) {
          const sessions = cleanStale(read())
          write(sessions)
          if (sessions.length === 0) return "No active sessions."
          const lines = sessions.map(s => {
            const isMe = s.pid === process.pid ? " ← current" : ""
            const age = Math.round((Date.now() - new Date(s.lastHeartbeat).getTime()) / 1000)
            const scope = s.scope ? ` scope: [${s.scope}]` : ""
            return `• "${s.title}"${isMe} | ${age}s ago${scope}`
          })
          // Scope overlap detection
          const withScope = sessions.filter(s => s.scope)
          if (withScope.length > 1) {
            for (let i = 0; i < withScope.length; i++) {
              for (let j = i + 1; j < withScope.length; j++) {
                const scopes1 = withScope[i].scope.split(/[,\s]+/).filter(Boolean)
                const scopes2 = withScope[j].scope.split(/[,\s]+/).filter(Boolean)
                for (const f1 of scopes1) {
                  for (const f2 of scopes2) {
                    if (f1.includes(f2) || f2.includes(f1)) {
                      lines.push(`⚠️  Overlap: "${withScope[i].title}" <-> "${withScope[j].title}" both cover "${f1.includes(f2) ? f2 : f1}"`)
                    }
                  }
                }
              }
            }
          }
          return lines.join("\n")
        },
      }),

      register_task: tool({
        description: "Declare what you are working on (description + affected files). Other sessions see this via check_sessions and get warned about scope overlap. Call at the start of every task.",
        args: {
          description: tool.schema.string().describe("Summary of what you are doing"),
          scope: tool.schema.string().describe("Affected files/directories"),
        },
        async execute(args, _ctx) {
          const sessions = read()
          const idx = sessions.findIndex(s => s.pid === process.pid)
          if (idx === -1) return "No active session found for current PID."
          sessions[idx].title = args.description
          sessions[idx].scope = args.scope
          write(cleanStale(sessions))
          return `Registered: "${args.description}" — scope: ${args.scope}`
        },
      }),
    },
  }
}
