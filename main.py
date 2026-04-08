"""
OrchestAI – Multi-Agent Enterprise Process Orchestration Platform
MVP Backend  |  FastAPI + SQLite (dev) + Anthropic API
"""

import asyncio
import hashlib
import json
import time
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import anthropic
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ─────────────────────────────────────────────
#  App setup
# ─────────────────────────────────────────────
app = FastAPI(
    title="OrchestAI API",
    description="Multi-Agent Enterprise Process Orchestration Platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores (replace with PostgreSQL in production)
workflows_db: Dict[str, dict] = {}
audit_chain: List[dict] = []
active_connections: List[WebSocket] = []


# ─────────────────────────────────────────────
#  Enums & Schemas
# ─────────────────────────────────────────────
class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkflowStatus(str, Enum):
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkflowCreateRequest(BaseModel):
    name: str = Field(..., example="Vendor Onboarding")
    description: str = Field(..., example="Onboard a new vendor: collect docs, verify, create account.")
    requires_approval: bool = True


class TaskNode(BaseModel):
    id: str
    name: str
    agent_type: str
    description: str
    depends_on: List[str] = []
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: str
    status: WorkflowStatus
    tasks: List[TaskNode]
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class ApprovalRequest(BaseModel):
    decision: str  # "approve" or "reject"
    comment: Optional[str] = ""


# ─────────────────────────────────────────────
#  Audit Ledger (hash-chained)
# ─────────────────────────────────────────────
def append_audit(workflow_id: str, task_id: str, action: str, detail: str):
    prev_hash = audit_chain[-1]["hash"] if audit_chain else "GENESIS"
    entry = {
        "id": str(uuid.uuid4()),
        "workflow_id": workflow_id,
        "task_id": task_id,
        "action": action,
        "detail": detail,
        "timestamp": datetime.utcnow().isoformat(),
        "prev_hash": prev_hash,
    }
    payload = json.dumps({k: v for k, v in entry.items() if k != "hash"}, sort_keys=True)
    entry["hash"] = hashlib.sha256(payload.encode()).hexdigest()
    audit_chain.append(entry)
    return entry


# ─────────────────────────────────────────────
#  WebSocket broadcast
# ─────────────────────────────────────────────
async def broadcast(message: dict):
    dead = []
    for ws in active_connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        active_connections.remove(ws)


# ─────────────────────────────────────────────
#  Planner Agent – uses Claude to generate DAG
# ─────────────────────────────────────────────
def planner_agent(workflow_name: str, description: str) -> List[dict]:
    """Call Claude to decompose workflow into task DAG."""
    client = anthropic.Anthropic()

    system_prompt = """You are OrchestAI's Planner Agent. Given a workflow description, 
decompose it into a directed acyclic graph (DAG) of tasks.

Return ONLY valid JSON — an array of task objects with these fields:
{
  "id": "t1",           // short unique id (t1, t2, ...)
  "name": "...",        // short task name
  "agent_type": "...",  // one of: email_agent, form_agent, data_fetch_agent, approval_agent, verification_agent, notification_agent
  "description": "...", // what this task does
  "depends_on": []      // list of task ids this depends on
}

Rules:
- Generate 4 to 7 tasks
- Include at least one approval_agent task
- Ensure the DAG is valid (no cycles)
- Return ONLY the JSON array, no markdown, no explanation"""

    user_prompt = f"Workflow: {workflow_name}\nDescription: {description}"

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    tasks_data = json.loads(raw)
    return tasks_data


# ─────────────────────────────────────────────
#  Worker Agent – simulate agent execution
# ─────────────────────────────────────────────
async def execute_worker_agent(workflow_id: str, task: dict) -> str:
    """Simulate worker agent execution with realistic delays."""
    agent_type = task["agent_type"]
    await asyncio.sleep(1.5)  # simulate real work

    responses = {
        "email_agent": f"Email sent successfully for '{task['name']}'. Recipient confirmed receipt.",
        "form_agent": f"Form '{task['name']}' auto-filled and submitted. Reference ID: {uuid.uuid4().hex[:8].upper()}",
        "data_fetch_agent": f"Data fetched for '{task['name']}'. Records retrieved: {42 + hash(task['id']) % 100}",
        "approval_agent": f"Approval request created for '{task['name']}'. Awaiting human decision.",
        "verification_agent": f"Verification complete for '{task['name']}'. Status: PASSED ✓",
        "notification_agent": f"Notification dispatched for '{task['name']}'. 3 stakeholders notified.",
    }
    return responses.get(agent_type, f"Task '{task['name']}' completed successfully.")


# ─────────────────────────────────────────────
#  Workflow Execution Engine
# ─────────────────────────────────────────────
async def run_workflow(workflow_id: str):
    """Execute workflow DAG asynchronously, respecting dependencies."""
    workflow = workflows_db[workflow_id]
    workflow["status"] = WorkflowStatus.RUNNING
    workflow["started_at"] = datetime.utcnow().isoformat()
    append_audit(workflow_id, "system", "WORKFLOW_STARTED", workflow["name"])
    await broadcast({"type": "workflow_update", "workflow": sanitize(workflow)})

    tasks = {t["id"]: t for t in workflow["tasks"]}
    completed_ids = set()

    while True:
        runnable = [
            t for t in tasks.values()
            if t["status"] == TaskStatus.PENDING
            and all(dep in completed_ids for dep in t["depends_on"])
        ]

        if not runnable:
            # Check if all tasks are done
            statuses = {t["status"] for t in tasks.values()}
            if TaskStatus.PENDING not in statuses and TaskStatus.RUNNING not in statuses:
                break
            if TaskStatus.WAITING_APPROVAL in statuses:
                await asyncio.sleep(2)
                continue
            break

        # Run runnable tasks concurrently
        async def run_task(task):
            task["status"] = TaskStatus.RUNNING
            task["started_at"] = datetime.utcnow().isoformat()
            append_audit(workflow_id, task["id"], "TASK_STARTED", task["name"])
            await broadcast({"type": "task_update", "workflow_id": workflow_id, "task": task})

            result = await execute_worker_agent(workflow_id, task)
            task["result"] = result

            if task["agent_type"] == "approval_agent" and workflow.get("requires_approval"):
                task["status"] = TaskStatus.WAITING_APPROVAL
                append_audit(workflow_id, task["id"], "AWAITING_APPROVAL", task["name"])
                await broadcast({"type": "task_update", "workflow_id": workflow_id, "task": task})

                # Wait up to 60s for approval
                for _ in range(60):
                    await asyncio.sleep(1)
                    current = workflows_db[workflow_id]["tasks"]
                    t = next((x for x in current if x["id"] == task["id"]), None)
                    if t and t["status"] in (TaskStatus.APPROVED, TaskStatus.REJECTED):
                        task["status"] = t["status"]
                        break
                else:
                    task["status"] = TaskStatus.APPROVED  # auto-approve on timeout
                    task["result"] += " [Auto-approved on timeout]"
            else:
                task["status"] = TaskStatus.COMPLETED

            task["completed_at"] = datetime.utcnow().isoformat()
            append_audit(workflow_id, task["id"], "TASK_COMPLETED", f"{task['name']} → {task['status']}")
            await broadcast({"type": "task_update", "workflow_id": workflow_id, "task": task})
            completed_ids.add(task["id"])

        await asyncio.gather(*[run_task(t) for t in runnable])

    # Finalize workflow
    all_statuses = [t["status"] for t in tasks.values()]
    if TaskStatus.REJECTED in all_statuses or TaskStatus.FAILED in all_statuses:
        workflow["status"] = WorkflowStatus.FAILED
    else:
        workflow["status"] = WorkflowStatus.COMPLETED

    workflow["completed_at"] = datetime.utcnow().isoformat()
    append_audit(workflow_id, "system", "WORKFLOW_COMPLETED", workflow["status"])
    await broadcast({"type": "workflow_update", "workflow": sanitize(workflow)})


def sanitize(w: dict) -> dict:
    """Convert enums to strings for JSON serialization."""
    import copy
    w2 = copy.deepcopy(w)
    w2["status"] = str(w2["status"])
    for t in w2.get("tasks", []):
        t["status"] = str(t["status"])
    return w2


# ─────────────────────────────────────────────
#  API Routes
# ─────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "OrchestAI API v0.1 – Multi-Agent Orchestration Platform"}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/workflow/create", response_model=WorkflowResponse)
async def create_workflow(req: WorkflowCreateRequest):
    """Create a workflow: call Planner Agent to generate DAG from natural language."""
    wf_id = str(uuid.uuid4())
    try:
        tasks_data = planner_agent(req.name, req.description)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Planner Agent failed: {str(e)}")

    tasks = [TaskNode(**t) for t in tasks_data]
    workflow = {
        "id": wf_id,
        "name": req.name,
        "description": req.description,
        "status": WorkflowStatus.CREATED,
        "tasks": [t.model_dump() for t in tasks],
        "requires_approval": req.requires_approval,
        "created_at": datetime.utcnow().isoformat(),
        "started_at": None,
        "completed_at": None,
    }
    workflows_db[wf_id] = workflow
    append_audit(wf_id, "system", "WORKFLOW_CREATED", req.name)
    return WorkflowResponse(**workflow)


@app.post("/workflow/{workflow_id}/run")
async def run_workflow_endpoint(workflow_id: str):
    """Start async execution of a workflow."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf = workflows_db[workflow_id]
    if wf["status"] not in (WorkflowStatus.CREATED, WorkflowStatus.PAUSED):
        raise HTTPException(status_code=400, detail=f"Workflow is already {wf['status']}")
    asyncio.create_task(run_workflow(workflow_id))
    return {"message": "Workflow execution started", "workflow_id": workflow_id}


@app.get("/workflow/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(workflow_id: str):
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return WorkflowResponse(**workflows_db[workflow_id])


@app.get("/workflows")
def list_workflows():
    return [
        {
            "id": w["id"],
            "name": w["name"],
            "status": str(w["status"]),
            "created_at": w["created_at"],
            "task_count": len(w["tasks"]),
        }
        for w in workflows_db.values()
    ]


@app.post("/workflow/{workflow_id}/task/{task_id}/approve")
async def approve_task(workflow_id: str, task_id: str, req: ApprovalRequest):
    """Human-in-the-loop: approve or reject a waiting task."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")
    tasks = workflows_db[workflow_id]["tasks"]
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != TaskStatus.WAITING_APPROVAL:
        raise HTTPException(status_code=400, detail="Task is not awaiting approval")

    new_status = TaskStatus.APPROVED if req.decision == "approve" else TaskStatus.REJECTED
    task["status"] = new_status
    task["result"] += f" | Human decision: {req.decision.upper()}. Comment: {req.comment}"
    append_audit(workflow_id, task_id, f"HUMAN_{req.decision.upper()}", req.comment or "")
    await broadcast({"type": "task_update", "workflow_id": workflow_id, "task": task})
    return {"message": f"Task {req.decision}d", "task_id": task_id}


@app.get("/audit")
def get_audit_log(workflow_id: Optional[str] = None):
    """Return the immutable audit chain, optionally filtered by workflow."""
    logs = audit_chain
    if workflow_id:
        logs = [e for e in audit_chain if e["workflow_id"] == workflow_id]
    return {"entries": logs, "total": len(logs)}


@app.get("/audit/verify")
def verify_audit_chain():
    """Verify the integrity of the hash chain."""
    for i, entry in enumerate(audit_chain):
        expected_prev = audit_chain[i - 1]["hash"] if i > 0 else "GENESIS"
        if entry["prev_hash"] != expected_prev:
            return {"valid": False, "broken_at": i, "entry_id": entry["id"]}
    return {"valid": True, "total_entries": len(audit_chain)}


@app.get("/agents")
def list_agents():
    """List available worker agent types."""
    return {
        "agents": [
            {"type": "email_agent", "name": "Email Agent", "description": "Sends and monitors emails", "icon": "📧"},
            {"type": "form_agent", "name": "Form Agent", "description": "Auto-fills and submits forms", "icon": "📝"},
            {"type": "data_fetch_agent", "name": "Data Fetch Agent", "description": "Retrieves data from APIs/DBs", "icon": "🔍"},
            {"type": "approval_agent", "name": "Approval Agent", "description": "Routes items for human approval", "icon": "✅"},
            {"type": "verification_agent", "name": "Verification Agent", "description": "Validates data and documents", "icon": "🔐"},
            {"type": "notification_agent", "name": "Notification Agent", "description": "Sends alerts to stakeholders", "icon": "🔔"},
        ]
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time execution updates."""
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)
