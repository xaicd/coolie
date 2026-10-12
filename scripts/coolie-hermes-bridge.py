#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/coolie-hermes-bridge.py
Hermes (QQ / 微信) ⇄ Coolie 控制面 (工坊会话 & 看板大盘) 双轨实时同步中枢
0 外部第三方库依赖，纯 Python 3 标准库自闭环实现
"""

import os
import sys
import time
import json
import sqlite3
import re
import datetime
import urllib.request
import urllib.error

HOME = os.environ.get("HOME", "/home/beye")
COOLIE_API = os.environ.get("COOLIE_API_URL", "http://127.0.0.1:3100/api")
HERMES_DIR = os.environ.get("HERMES_HOME", os.path.join(HOME, ".hermes"))
STATE_DB_PATH = os.path.join(HERMES_DIR, "state.db")
DATA_DIR = os.environ.get("COOLIE_DATA_DIR", os.path.join(HOME, ".coolie-dev/data"))
SYNC_STATE_FILE = os.path.join(DATA_DIR, "bridge-sync-state.json")
PID_FILE = os.path.join(DATA_DIR, "bridge.pid")

def api_request(path, method="GET", data=None):
    clean_path = path if path.startswith("/") else f"/{path}"
    url = f"{COOLIE_API.rstrip('/')}{clean_path}"
    body = None
    headers = {"Content-Type": "application/json"}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Length"] = str(len(body))
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            try:
                return json.loads(raw)
            except Exception:
                return raw
    except Exception as e:
        raise RuntimeError(f"API 请求失败 ({path}): {str(e)}")

def load_sync_state():
    if os.path.exists(SYNC_STATE_FILE):
        try:
            with open(SYNC_STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"last_synced_id": 0, "active_session_id": None, "created_tasks": []}

def save_sync_state(state):
    os.makedirs(os.path.dirname(SYNC_STATE_FILE), exist_ok=True)
    tmp_file = f"{SYNC_STATE_FILE}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(tmp_file, SYNC_STATE_FILE)

def resolve_coolie_context():
    companies = api_request("/companies")
    company_list = companies if isinstance(companies, list) else companies.get("items", [])
    company = None
    for c in company_list:
        name = c.get("name", "")
        if "wenlv" in name.lower() or "文旅" in name:
            company = c
            break
    if not company and company_list:
        company = company_list[0]
    if not company:
        raise RuntimeError("未在 Coolie 控制面中找到活跃公司")

    issues = api_request(f"/companies/{company['id']}/issues")
    issue_list = issues if isinstance(issues, list) else issues.get("items", [])
    workshop_issue = None
    for i in issue_list:
        title = i.get("title", "")
        if "工坊" in title or "Conversation" in title:
            workshop_issue = i
            break
    
    if not workshop_issue:
        workshop_issue = api_request(f"/companies/{company['id']}/issues", method="POST", data={
            "title": f"Conversation {company.get('name', 'Main')} 工坊",
            "description": "Standing issue for project board concierge conversation",
            "status": "todo",
            "priority": "high"
        })
    
    # 查找默认主力研发员工（优先铁匠）
    agents = api_request(f"/companies/{company['id']}/agents")
    agent_list = agents if isinstance(agents, list) else agents.get("items", [])
    target_agent = None
    for a in agent_list:
        name = a.get("name", "")
        title = a.get("title", "")
        if "铁匠" in name or "Core SWE" in title:
            target_agent = a
            break
    if not target_agent and agent_list:
        target_agent = agent_list[0]

    return company, workshop_issue, target_agent

def find_active_qq_session(conn):
    cur = conn.cursor()
    # 查找最近活跃的带 qqbot / 4d9afc 的 session
    row = cur.execute("""
        SELECT session_id FROM messages 
        WHERE session_id LIKE '%4d9afc%' OR content LIKE '%qqbot%' 
        ORDER BY id DESC LIMIT 1
    """).fetchone()
    if row:
        return row[0]
    return "20261011_142610_4d9afc"

def clean_user_text(raw):
    if not raw:
        return ""
    text = raw.strip()
    if "Gateway message origin" in text:
        text = re.sub(r'Gateway message origin[^{]*\{.*?\}\s*', '', text, flags=re.DOTALL).strip()
    text = re.sub(r'\[OUT-OF-BAND USER MESSAGE[^\]]*\]', '', text)
    text = re.sub(r'\[/OUT-OF-BAND USER MESSAGE\]', '', text)
    text = re.sub(r'Do not guess a reply destination[^\n]*\n?', '', text)
    return text.strip()

def format_bg_proc(raw):
    cmd_match = re.search(r'Command:\s*([^\n]+)', raw)
    exit_match = re.search(r'exit code\s*(\d+)', raw)
    cmd = cmd_match.group(1).strip() if cmd_match else "后台任务"
    exit_code = exit_match.group(1) if exit_match else "0"
    
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    key_lines = []
    for l in lines:
        if any(k in l for k in ["STAGE", "HTTP 200", "HTTP 400", "healthy", "Loaded image", "docker ps", "Error", "error"]):
            key_lines.append(l)
    if not key_lines:
        key_lines = lines[-4:]
    else:
        key_lines = key_lines[-8:]
    summary = "\n".join(key_lines)
    return f"⚙️ **【后台执行凭据 (Exit Code: {exit_code})】**\n```bash\n{cmd[:180]}\n```\n```text\n{summary}\n```"

def post_comment(workshop_issue_id, body_text):
    if not body_text or not body_text.strip():
        return
    api_request(f"/issues/{workshop_issue_id}/comments", method="POST", data={
        "body": body_text.strip()
    })

def maybe_create_task(company_id, workshop_issue_id, user_text, target_agent, sync_state):
    text = user_text.strip()
    if len(text) < 4:
        return
    if text in ["确认", "开工", "好", "ok", "好的", "a,c 就行了", "a,b,c,d"]:
        return
        
    triggers = ["修一下", "修", "报错", "异常", "让 agy 修", "让 cmd 看看", "优化", "部署", "标准 部署"]
    is_task = any(t in text for t in triggers)
    if not is_task:
        return
        
    created = sync_state.get("created_tasks", [])
    title_snippet = text.split("\n")[0][:40]
    for c in created:
        if c in title_snippet or title_snippet in c:
            return
            
    task_title = f"[QQ] {title_snippet}"
    try:
        new_issue = api_request(f"/companies/{company_id}/issues", method="POST", data={
            "title": task_title,
            "description": f"【来源渠道】：QQ 掌柜指令\n\n{text}",
            "status": "in_progress",
            "priority": "high",
            "assigneeAgentId": target_agent.get("id") if target_agent else None
        })
        sync_state["created_tasks"].append(title_snippet)
        if len(sync_state["created_tasks"]) > 50:
            sync_state["created_tasks"].pop(0)
            
        ident = new_issue.get("identifier") or new_issue.get("id")
        post_comment(workshop_issue_id, f"📌 **【已自动立项看板工单】** [`{ident}`] {task_title}\n> 责任员工：{target_agent.get('name', '铁匠')} | 状态：in_progress")
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 成功创建工单: {ident} - {task_title}", flush=True)
    except Exception as e:
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 创建工单失败: {e}", flush=True)

def run():
    print(f"🚀 [Coolie-Hermes Bridge] 实时同步守护启动 PID: {os.getpid()}", flush=True)
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))
        
    company, workshop_issue, target_agent = resolve_coolie_context()
    print(f"  • 公司: {company.get('name')} | 工坊: {workshop_issue.get('title')}", flush=True)
    
    sync_state = load_sync_state()
    last_id = sync_state.get("last_synced_id", 0)
    
    conn = sqlite3.connect(f"file:{STATE_DB_PATH}?mode=ro", uri=True)
    
    # 首次启动且无记录时，初始化最高水位
    if last_id == 0:
        cur = conn.cursor()
        active_sess = find_active_qq_session(conn)
        row = cur.execute("SELECT max(id) FROM messages WHERE session_id = ?", (active_sess,)).fetchone()
        last_id = row[0] if row and row[0] else 0
        sync_state["last_synced_id"] = last_id
        save_sync_state(sync_state)
        print(f"  • 初始化监听最新水位 ID: {last_id}", flush=True)
    
    while True:
        try:
            active_session_id = find_active_qq_session(conn)
            cur = conn.cursor()
            rows = cur.execute("""
                SELECT id, role, content, timestamp 
                FROM messages 
                WHERE session_id = ? AND id > ? AND (role = 'user' OR role = 'assistant')
                ORDER BY id ASC LIMIT 20
            """, (active_session_id, last_id)).fetchall()
            
            for mid, role, content, ts in rows:
                if not content or not content.strip():
                    last_id = max(last_id, mid)
                    continue
                # 忽略内部 cron 调度消息
                if "You are running as a scheduled cron job" in content:
                    last_id = max(last_id, mid)
                    continue
                    
                time_str = datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
                if role == "user":
                    if "[IMPORTANT: Background process" in content:
                        body = format_bg_proc(content)
                    else:
                        cleaned = clean_user_text(content)
                        if not cleaned:
                            last_id = max(last_id, mid)
                            continue
                        body = f"👤 **掌柜 (QQ 终端) · {time_str}**:\n> {cleaned}"
                        maybe_create_task(company["id"], workshop_issue["id"], cleaned, target_agent, sync_state)
                else:
                    text = content.strip()
                    if text.startswith("[brief:") and len(text) < 40:
                        last_id = max(last_id, mid)
                        continue
                    body = f"🤖 **Hermes (交付掌柜) · {time_str}**:\n{text}"
                    
                try:
                    post_comment(workshop_issue["id"], body)
                    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 同步 #{mid} ({role}) -> 工坊", flush=True)
                except Exception as e:
                    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 同步失败 #{mid}: {e}", flush=True)
                    
                last_id = max(last_id, mid)
                sync_state["last_synced_id"] = last_id
                save_sync_state(sync_state)
                
        except Exception as e:
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 轮询异常: {e}", flush=True)
            
        time.sleep(1.0)

if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        sys.exit(0)
