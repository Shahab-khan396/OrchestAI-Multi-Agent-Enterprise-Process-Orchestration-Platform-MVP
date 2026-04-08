import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "http://localhost:8000";

// ── Design tokens ──────────────────────────────────────
const COLORS = {
  bg: "#0A0C10",
  surface: "#111318",
  card: "#161B22",
  border: "#21262D",
  borderHover: "#30363D",
  accent: "#58A6FF",
  accentDim: "#1F3450",
  green: "#3FB950",
  greenDim: "#1A3A20",
  orange: "#F0883E",
  orangeDim: "#3D2010",
  red: "#F85149",
  redDim: "#3D1C1B",
  purple: "#BC8CFF",
  purpleDim: "#2D1F4E",
  cyan: "#39C5CF",
  cyanDim: "#0F2F33",
  textPrimary: "#E6EDF3",
  textSecondary: "#8B949E",
  textMuted: "#484F58",
};

const STATUS_CONFIG = {
  pending:          { color: COLORS.textMuted,    bg: "#1C2128", label: "Pending" },
  running:          { color: COLORS.cyan,         bg: COLORS.cyanDim, label: "Running" },
  waiting_approval: { color: COLORS.orange,       bg: COLORS.orangeDim, label: "Awaiting Approval" },
  approved:         { color: COLORS.green,        bg: COLORS.greenDim, label: "Approved" },
  rejected:         { color: COLORS.red,          bg: COLORS.redDim, label: "Rejected" },
  completed:        { color: COLORS.green,        bg: COLORS.greenDim, label: "Completed" },
  failed:           { color: COLORS.red,          bg: COLORS.redDim, label: "Failed" },
  created:          { color: COLORS.accent,       bg: COLORS.accentDim, label: "Created" },
  paused:           { color: COLORS.orange,       bg: COLORS.orangeDim, label: "Paused" },
};

const AGENT_ICONS = {
  email_agent:       "✉",
  form_agent:        "📋",
  data_fetch_agent:  "🔍",
  approval_agent:    "✔",
  verification_agent:"🔐",
  notification_agent:"🔔",
};

// ── Tiny helpers ───────────────────────────────────────
const fmt = (s) => {
  if (!s) return "—";
  const d = new Date(s + "Z");
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const pulse = `
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideIn { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
  @keyframes progressFill { from{width:0} to{width:var(--w)} }
  @keyframes glow { 0%,100%{box-shadow:0 0 8px 2px #58A6FF33} 50%{box-shadow:0 0 18px 4px #58A6FF66} }
`;

// ── Sub-components ─────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const isRunning = status === "running";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      border: `1px solid ${cfg.color}33`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: cfg.color,
        animation: isRunning ? "pulse 1.4s ease-in-out infinite" : "none",
      }} />
      {cfg.label}
    </span>
  );
}

function TaskNode({ task, workflowId, onApprove }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const isWaiting = task.status === "waiting_approval";

  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${isWaiting ? COLORS.orange + "66" : COLORS.border}`,
      borderRadius: 10, padding: "12px 14px", marginBottom: 8,
      animation: "slideIn 0.3s ease",
      boxShadow: isWaiting ? `0 0 12px ${COLORS.orange}22` : "none",
      transition: "border-color 0.3s, box-shadow 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
           onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>
          {AGENT_ICONS[task.agent_type] || "⚙"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: COLORS.textPrimary, fontWeight: 500, fontSize: 13 }}>
              {task.name}
            </span>
            <StatusBadge status={task.status} />
          </div>
          <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2 }}>
            {task.agent_type.replace(/_/g, " ")}
            {task.started_at && ` · started ${fmt(task.started_at)}`}
            {task.completed_at && ` · done ${fmt(task.completed_at)}`}
          </div>
        </div>
        <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
          <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "0 0 6px" }}>
            {task.description}
          </p>
          {task.result && (
            <div style={{
              background: "#0D1117", border: `1px solid ${COLORS.border}`,
              borderRadius: 6, padding: "8px 10px",
              color: COLORS.textSecondary, fontSize: 11, fontFamily: "monospace",
            }}>
              {task.result}
            </div>
          )}
          {task.depends_on?.length > 0 && (
            <div style={{ marginTop: 6, color: COLORS.textMuted, fontSize: 11 }}>
              Depends on: {task.depends_on.join(", ")}
            </div>
          )}
        </div>
      )}

      {isWaiting && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.orange}33`,
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <span style={{ color: COLORS.orange, fontSize: 12, flex: 1 }}>
            ⚠ Human approval required
          </span>
          <button onClick={() => onApprove(workflowId, task.id, "approve")}
            style={{
              background: COLORS.greenDim, color: COLORS.green,
              border: `1px solid ${COLORS.green}44`, borderRadius: 6,
              padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
            }}>
            Approve
          </button>
          <button onClick={() => onApprove(workflowId, task.id, "reject")}
            style={{
              background: COLORS.redDim, color: COLORS.red,
              border: `1px solid ${COLORS.red}44`, borderRadius: 6,
              padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
            }}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function WorkflowCard({ workflow, onRun, onApprove, onSelect, selected }) {
  const pct = workflow.tasks.length
    ? Math.round((workflow.tasks.filter(t =>
        ["completed","approved","rejected"].includes(t.status)).length / workflow.tasks.length) * 100)
    : 0;

  return (
    <div onClick={() => onSelect(workflow.id)}
      style={{
        background: selected ? "#1C2235" : COLORS.card,
        border: `1px solid ${selected ? COLORS.accent + "88" : COLORS.border}`,
        borderRadius: 12, padding: 16, marginBottom: 10,
        cursor: "pointer", transition: "all 0.2s",
        animation: "fadeIn 0.3s ease",
        boxShadow: selected ? `0 0 14px ${COLORS.accent}22` : "none",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ color: COLORS.textPrimary, fontWeight: 600, fontSize: 14 }}>
            {workflow.name}
          </div>
          <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
            {workflow.tasks.length} tasks · created {fmt(workflow.created_at)}
          </div>
        </div>
        <StatusBadge status={workflow.status} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Progress</span>
          <span style={{ color: COLORS.textSecondary, fontSize: 11 }}>{pct}%</span>
        </div>
        <div style={{ background: COLORS.border, borderRadius: 4, height: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4, width: pct + "%",
            background: pct === 100 ? COLORS.green : COLORS.accent,
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {workflow.status === "created" && (
        <button onClick={e => { e.stopPropagation(); onRun(workflow.id); }}
          style={{
            width: "100%", background: COLORS.accentDim, color: COLORS.accent,
            border: `1px solid ${COLORS.accent}44`, borderRadius: 8,
            padding: "8px 0", fontSize: 12, cursor: "pointer", fontWeight: 600,
            transition: "all 0.2s",
          }}>
          ▶ Run Workflow
        </button>
      )}
    </div>
  );
}

function DAGVisualization({ tasks }) {
  if (!tasks || tasks.length === 0) return null;

  const levels = {};
  const inDegree = {};
  tasks.forEach(t => { inDegree[t.id] = 0; });
  tasks.forEach(t => t.depends_on?.forEach(d => { inDegree[t.id] = (inDegree[t.id] || 0) + 1; }));

  const queue = tasks.filter(t => !t.depends_on || t.depends_on.length === 0).map(t => ({ id: t.id, level: 0 }));
  const visited = {};
  while (queue.length) {
    const { id, level } = queue.shift();
    if (visited[id]) continue;
    visited[id] = true;
    levels[id] = level;
    const deps = tasks.filter(t => t.depends_on?.includes(id));
    deps.forEach(t => queue.push({ id: t.id, level: level + 1 }));
  }

  const maxLevel = Math.max(...Object.values(levels), 0);
  const byLevel = {};
  Object.entries(levels).forEach(([id, l]) => {
    if (!byLevel[l]) byLevel[l] = [];
    byLevel[l].push(tasks.find(t => t.id === id));
  });

  return (
    <div style={{ overflowX: "auto", padding: "8px 0" }}>
      <div style={{ display: "flex", gap: 16, minWidth: "fit-content", alignItems: "center" }}>
        {Array.from({ length: maxLevel + 1 }, (_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            {(byLevel[i] || []).map(task => {
              const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
              return (
                <div key={task.id} style={{
                  background: cfg.bg, border: `1.5px solid ${cfg.color}55`,
                  borderRadius: 8, padding: "8px 12px", minWidth: 100, textAlign: "center",
                  animation: task.status === "running" ? "glow 2s ease-in-out infinite" : "none",
                }}>
                  <div style={{ fontSize: 16 }}>{AGENT_ICONS[task.agent_type] || "⚙"}</div>
                  <div style={{ color: cfg.color, fontSize: 10, fontWeight: 600, marginTop: 3 }}>
                    {task.name.length > 14 ? task.name.slice(0, 13) + "…" : task.name}
                  </div>
                </div>
              );
            })}
            {i < maxLevel && (
              <div style={{ color: COLORS.textMuted, fontSize: 16, alignSelf: "center", marginLeft: 8 }}>→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditLog({ entries }) {
  return (
    <div style={{ fontFamily: "monospace" }}>
      {entries.slice().reverse().slice(0, 30).map((e, i) => (
        <div key={e.id} style={{
          display: "flex", gap: 10, padding: "7px 10px",
          borderBottom: `1px solid ${COLORS.border}`,
          animation: "slideIn 0.2s ease",
          animationDelay: `${i * 0.03}s`,
        }}>
          <span style={{ color: COLORS.textMuted, fontSize: 10, whiteSpace: "nowrap", paddingTop: 1 }}>
            {fmt(e.timestamp)}
          </span>
          <span style={{
            color: e.action.includes("COMPLETED") ? COLORS.green
                 : e.action.includes("STARTED") ? COLORS.cyan
                 : e.action.includes("APPROVAL") || e.action.includes("HUMAN") ? COLORS.orange
                 : e.action.includes("REJECTED") || e.action.includes("FAILED") ? COLORS.red
                 : COLORS.textSecondary,
            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            {e.action}
          </span>
          <span style={{ color: COLORS.textMuted, fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.detail}
          </span>
          <span style={{ color: COLORS.textMuted, fontSize: 9, opacity: 0.5 }}>
            {e.hash?.slice(0, 8)}…
          </span>
        </div>
      ))}
      {entries.length === 0 && (
        <div style={{ color: COLORS.textMuted, fontSize: 12, padding: 20, textAlign: "center" }}>
          No audit entries yet
        </div>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────
export default function OrchestAI() {
  const [tab, setTab] = useState("dashboard");
  const [workflows, setWorkflows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [toast, setToast] = useState(null);
  const wsRef = useRef(null);

  // Form state
  const [wfName, setWfName] = useState("");
  const [wfDesc, setWfDesc] = useState("");
  const [wfApproval, setWfApproval] = useState(true);

  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [wfRes, auRes, agRes] = await Promise.all([
        fetch(`${API_BASE}/workflows`),
        fetch(`${API_BASE}/audit`),
        fetch(`${API_BASE}/agents`),
      ]);
      if (wfRes.ok) {
        const wfList = await wfRes.json();
        // Fetch full details for each workflow
        const full = await Promise.all(
          wfList.map(w => fetch(`${API_BASE}/workflow/${w.id}`).then(r => r.json()))
        );
        setWorkflows(full);
      }
      if (auRes.ok) { const d = await auRes.json(); setAuditEntries(d.entries || []); }
      if (agRes.ok) { const d = await agRes.json(); setAgents(d.agents || []); }
    } catch (e) {
      // backend not running
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 4000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(`ws://localhost:8000/ws`);
        ws.onopen = () => setWsStatus("connected");
        ws.onclose = () => { setWsStatus("disconnected"); setTimeout(connect, 3000); };
        ws.onerror = () => setWsStatus("error");
        ws.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.type === "workflow_update" || data.type === "task_update") fetchAll();
        };
        wsRef.current = ws;
      } catch { setWsStatus("error"); }
    };
    connect();
    return () => wsRef.current?.close();
  }, [fetchAll]);

  const createWorkflow = async () => {
    if (!wfName.trim() || !wfDesc.trim()) { showToast("Please fill all fields", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workflow/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wfName, description: wfDesc, requires_approval: wfApproval }),
      });
      if (res.ok) {
        showToast("Workflow created! Planner Agent generated the DAG.", "success");
        setWfName(""); setWfDesc("");
        fetchAll(); setTab("dashboard");
      } else {
        const d = await res.json();
        showToast(d.detail || "Failed to create workflow", "error");
      }
    } catch { showToast("Cannot reach backend. Start FastAPI server.", "error"); }
    finally { setLoading(false); }
  };

  const runWorkflow = async (id) => {
    try {
      await fetch(`${API_BASE}/workflow/${id}/run`, { method: "POST" });
      showToast("Workflow started!", "success");
      fetchAll();
    } catch { showToast("Failed to start workflow", "error"); }
  };

  const approveTask = async (workflowId, taskId, decision) => {
    try {
      await fetch(`${API_BASE}/workflow/${workflowId}/task/${taskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: "Reviewed via control panel" }),
      });
      showToast(`Task ${decision}d`, decision === "approve" ? "success" : "error");
      fetchAll();
    } catch { showToast("Failed to submit decision", "error"); }
  };

  const selected = workflows.find(w => w.id === selectedId);
  const pendingApprovals = workflows.flatMap(w =>
    (w.tasks || []).filter(t => t.status === "waiting_approval").map(t => ({ ...t, workflowId: w.id, workflowName: w.name }))
  );

  // Stats
  const stats = {
    total: workflows.length,
    running: workflows.filter(w => w.status === "running").length,
    completed: workflows.filter(w => w.status === "completed").length,
    failed: workflows.filter(w => w.status === "failed").length,
    approvals: pendingApprovals.length,
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "new", label: "+ New Workflow" },
    { id: "audit", label: `Audit Log (${auditEntries.length})` },
    { id: "agents", label: "Agents" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg,
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: COLORS.textPrimary,
    }}>
      <style>{pulse}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.type === "success" ? COLORS.greenDim : toast.type === "error" ? COLORS.redDim : COLORS.accentDim,
          color: toast.type === "success" ? COLORS.green : toast.type === "error" ? COLORS.red : COLORS.accent,
          border: `1px solid ${toast.type === "success" ? COLORS.green : toast.type === "error" ? COLORS.red : COLORS.accent}44`,
          borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 500,
          animation: "fadeIn 0.3s ease", maxWidth: 340,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`,
        padding: "0 24px", display: "flex", alignItems: "center", gap: 20,
      }}>
        <div style={{ padding: "14px 0", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #58A6FF, #BC8CFF)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>OrchestAI</div>
            <div style={{ color: COLORS.textMuted, fontSize: 10 }}>Multi-Agent Orchestration</div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", gap: 2, padding: "0 8px" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? COLORS.card : "transparent",
                color: tab === t.id ? COLORS.textPrimary : COLORS.textSecondary,
                border: tab === t.id ? `1px solid ${COLORS.border}` : "1px solid transparent",
                borderRadius: 6, padding: "6px 14px", fontSize: 12,
                cursor: "pointer", fontWeight: tab === t.id ? 600 : 400,
                transition: "all 0.15s",
              }}>
              {t.label}
              {t.id === "new" && pendingApprovals.length > 0 && (
                <span style={{
                  marginLeft: 6, background: COLORS.orange, color: "#000",
                  borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700,
                }}>
                  {pendingApprovals.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* WS status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: wsStatus === "connected" ? COLORS.green : wsStatus === "connecting" ? COLORS.orange : COLORS.red,
            animation: wsStatus === "connected" ? "pulse 2s ease-in-out infinite" : "none",
          }} />
          <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
            {wsStatus === "connected" ? "Live" : wsStatus}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total Workflows", value: stats.total, color: COLORS.accent },
                { label: "Running", value: stats.running, color: COLORS.cyan },
                { label: "Completed", value: stats.completed, color: COLORS.green },
                { label: "Failed", value: stats.failed, color: COLORS.red },
                { label: "Pending Approvals", value: stats.approvals, color: COLORS.orange },
              ].map(s => (
                <div key={s.label} style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "14px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Pending approvals banner */}
            {pendingApprovals.length > 0 && (
              <div style={{
                background: COLORS.orangeDim, border: `1px solid ${COLORS.orange}44`,
                borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                display: "flex", alignItems: "center", gap: 10,
                animation: "glow 2.5s ease-in-out infinite",
              }}>
                <span style={{ fontSize: 18 }}>⚠</span>
                <span style={{ color: COLORS.orange, fontWeight: 600, fontSize: 13 }}>
                  {pendingApprovals.length} task{pendingApprovals.length > 1 ? "s" : ""} awaiting human approval
                </span>
                <span style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  — select a workflow below to review
                </span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
              {/* Left: workflow list */}
              <div>
                <div style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>
                  WORKFLOWS
                </div>
                {workflows.length === 0 ? (
                  <div style={{
                    background: COLORS.card, border: `1px dashed ${COLORS.border}`,
                    borderRadius: 10, padding: 24, textAlign: "center", color: COLORS.textMuted, fontSize: 12,
                  }}>
                    No workflows yet.<br />
                    <span style={{ color: COLORS.accent, cursor: "pointer" }} onClick={() => setTab("new")}>
                      Create your first workflow →
                    </span>
                  </div>
                ) : (
                  workflows.map(w => (
                    <WorkflowCard key={w.id} workflow={w}
                      onRun={runWorkflow} onApprove={approveTask}
                      onSelect={setSelectedId} selected={selectedId === w.id} />
                  ))
                )}
              </div>

              {/* Right: selected workflow detail */}
              <div>
                {selected ? (
                  <div>
                    <div style={{
                      background: COLORS.card, border: `1px solid ${COLORS.border}`,
                      borderRadius: 12, padding: 18, marginBottom: 16,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div>
                          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{selected.name}</h2>
                          <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "4px 0 0" }}>
                            {selected.description}
                          </p>
                        </div>
                        <StatusBadge status={selected.status} />
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                        {[
                          { label: "Created", value: fmt(selected.created_at) },
                          { label: "Started", value: fmt(selected.started_at) },
                          { label: "Completed", value: fmt(selected.completed_at) },
                          { label: "Tasks", value: selected.tasks.length },
                        ].map(m => (
                          <div key={m.label}>
                            <div style={{ color: COLORS.textMuted, fontSize: 10 }}>{m.label}</div>
                            <div style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 500 }}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* DAG */}
                    <div style={{
                      background: COLORS.card, border: `1px solid ${COLORS.border}`,
                      borderRadius: 12, padding: 16, marginBottom: 16,
                    }}>
                      <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 10, letterSpacing: "0.08em" }}>
                        EXECUTION DAG
                      </div>
                      <DAGVisualization tasks={selected.tasks} />
                    </div>

                    {/* Tasks */}
                    <div style={{
                      background: COLORS.card, border: `1px solid ${COLORS.border}`,
                      borderRadius: 12, padding: 16,
                    }}>
                      <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 10, letterSpacing: "0.08em" }}>
                        TASK DETAILS
                      </div>
                      {selected.tasks.map(t => (
                        <TaskNode key={t.id} task={t} workflowId={selected.id} onApprove={approveTask} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: COLORS.card, border: `1px dashed ${COLORS.border}`,
                    borderRadius: 12, padding: 40, textAlign: "center",
                    color: COLORS.textMuted, fontSize: 13,
                  }}>
                    ← Select a workflow to view execution details
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── NEW WORKFLOW ── */}
        {tab === "new" && (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Create New Workflow</h2>
            <p style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 24 }}>
              Describe your workflow in plain English. The Planner Agent will decompose it into a task DAG.
            </p>

            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: 24,
            }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  WORKFLOW NAME
                </label>
                <input value={wfName} onChange={e => setWfName(e.target.value)}
                  placeholder="e.g. Vendor Onboarding"
                  style={{
                    width: "100%", background: "#0D1117", border: `1px solid ${COLORS.border}`,
                    borderRadius: 8, padding: "10px 12px", color: COLORS.textPrimary, fontSize: 14,
                    outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = COLORS.accent}
                  onBlur={e => e.target.style.borderColor = COLORS.border}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  DESCRIPTION (plain English)
                </label>
                <textarea value={wfDesc} onChange={e => setWfDesc(e.target.value)} rows={4}
                  placeholder="e.g. Onboard a new vendor by collecting documentation, verifying credentials, getting manager approval, and creating system accounts."
                  style={{
                    width: "100%", background: "#0D1117", border: `1px solid ${COLORS.border}`,
                    borderRadius: 8, padding: "10px 12px", color: COLORS.textPrimary, fontSize: 13,
                    outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.6,
                    fontFamily: "inherit", transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = COLORS.accent}
                  onBlur={e => e.target.style.borderColor = COLORS.border}
                />
              </div>

              <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="approval" checked={wfApproval}
                  onChange={e => setWfApproval(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <label htmlFor="approval" style={{ color: COLORS.textSecondary, fontSize: 13, cursor: "pointer" }}>
                  Require human approval for approval tasks
                </label>
              </div>

              <button onClick={createWorkflow} disabled={loading}
                style={{
                  width: "100%",
                  background: loading ? COLORS.accentDim : "linear-gradient(135deg, #58A6FF, #BC8CFF)",
                  color: loading ? COLORS.accent : "#0A0C10",
                  border: "none", borderRadius: 8, padding: "12px 0",
                  fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                  transition: "opacity 0.2s",
                  opacity: loading ? 0.7 : 1,
                }}>
                {loading ? "⏳ Calling Planner Agent…" : "⚡ Create Workflow"}
              </button>

              <div style={{ marginTop: 16, padding: 12, background: "#0D1117", borderRadius: 8 }}>
                <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
                  EXAMPLE WORKFLOWS
                </div>
                {[
                  ["Vendor Onboarding", "Onboard a new vendor: collect documents, verify credentials, get manager approval, create system access."],
                  ["Employee Offboarding", "Offboard an employee: revoke system access, collect equipment, process final payroll, archive records."],
                  ["Compliance Report", "Generate monthly compliance report: fetch data from all departments, verify completeness, get sign-off, distribute."],
                ].map(([n, d]) => (
                  <div key={n}
                    onClick={() => { setWfName(n); setWfDesc(d); }}
                    style={{
                      padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                      color: COLORS.accent, fontSize: 12, marginBottom: 4,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.accentDim}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    → {n}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AUDIT LOG ── */}
        {tab === "audit" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Audit Trail</h2>
                <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "4px 0 0" }}>
                  Immutable SHA-256 hash-chained log of all agent actions
                </p>
              </div>
              <div style={{
                background: COLORS.greenDim, color: COLORS.green,
                border: `1px solid ${COLORS.green}44`,
                borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600,
              }}>
                ✔ Chain Intact · {auditEntries.length} entries
              </div>
            </div>
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, overflow: "hidden",
            }}>
              <AuditLog entries={auditEntries} />
            </div>
          </div>
        )}

        {/* ── AGENTS ── */}
        {tab === "agents" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Agent Registry</h2>
            <p style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 20 }}>
              Available worker agents in the pool
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {agents.map(a => (
                <div key={a.type} style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 12, padding: 18, animation: "fadeIn 0.3s ease",
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.borderHover}
                onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{a.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{a.name}</div>
                  <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>{a.description}</div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{
                      background: COLORS.greenDim, color: COLORS.green,
                      border: `1px solid ${COLORS.green}33`,
                      borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 600,
                    }}>● Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
