#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/sync-qq-history.py
一键回填 Hermes QQ 历史会话对话与执行凭据到 Coolie 工坊常设会话 (WEN-1)，
并根据真实指令在看板正规化立项。
"""

import os
import sys
import time
import json
import sqlite3
import datetime
import urllib.request
import re

COOLIE_API = os.environ.get("COOLIE_API_URL", "http://127.0.0.1:3100/api")
STATE_DB = os.environ.get("HERMES_STATE_DB", os.path.expanduser("~/.hermes/state.db"))
QQ_SESSION_ID = os.environ.get("QQ_SESSION_ID", "20261011_142610_4d9afc")

def api(path, method="GET", data=None):
    url = f"{COOLIE_API.rstrip('/')}{path if path.startswith('/') else '/' + path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    if body:
        headers["Content-Length"] = str(len(body))
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        res_raw = resp.read().decode("utf-8")
        try:
            return json.loads(res_raw)
        except Exception:
            return res_raw

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
        if any(k in l for k in ["STAGE", "HTTP 200", "HTTP 400", "healthy", "Loaded image", "docker ps"]):
            key_lines.append(l)
    if not key_lines:
        key_lines = lines[-4:]
    else:
        key_lines = key_lines[-8:]
    summary = "\n".join(key_lines)
    return f"⚙️ **【后台执行凭据 (Exit Code: {exit_code})】**\n```bash\n{cmd[:180]}\n```\n```text\n{summary}\n```"

def main():
    print("🚀 [Coolie] 开始回填 QQ 通道真实对话并正规化立项...")
    companies = api("/companies")
    company_list = companies if isinstance(companies, list) else companies.get("items", [])
    company = [c for c in company_list if "wenlv" in c.get("name", "").lower() or "文旅" in c.get("name", "")][0]
    
    issues = api(f"/companies/{company['id']}/issues")
    issue_list = issues if isinstance(issues, list) else issues.get("items", [])
    workshop_issue = [i for i in issue_list if "工坊" in i.get("title", "") or "Conversation" in i.get("title", "")][0]
    
    print(f"  • 公司: {company['name']} ({company['id']})")
    print(f"  • 工坊工单: {workshop_issue['title']} ({workshop_issue['id']})")
    
    conn = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
    cur = conn.cursor()
    
    rows = cur.execute("""
        SELECT id, role, content, timestamp 
        FROM messages 
        WHERE session_id = ? 
          AND timestamp >= 1791734400 
          AND (role = 'user' OR role = 'assistant')
          AND content IS NOT NULL
        ORDER BY id ASC
    """, (QQ_SESSION_ID,)).fetchall()
    
    print(f"  • 检索到今天该 QQ 会话共 {len(rows)} 条消息")
    
    valid_entries = []
    for mid, role, content, ts in rows:
        if not content or not content.strip():
            continue
        if "You are running as a scheduled cron job" in content:
            continue
        if role == "user":
            if "[IMPORTANT: Background process" in content:
                valid_entries.append((mid, "bg_proc", format_bg_proc(content), ts))
            else:
                cleaned = clean_user_text(content)
                if cleaned and len(cleaned) >= 2:
                    valid_entries.append((mid, "user", cleaned, ts))
        elif role == "assistant":
            text = content.strip()
            if text.startswith("[brief:") and len(text) < 40:
                continue
            valid_entries.append((mid, "assistant", text, ts))
            
    print(f"  • 精炼出有效会话记录 {len(valid_entries)} 条")
    
    synced_count = 0
    for mid, kind, text, ts in valid_entries[-25:]:
        time_str = datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
        if kind == "user":
            body = f"👤 **掌柜 (QQ 终端) · {time_str}**:\n> {text}"
        elif kind == "bg_proc":
            body = text
        else:
            body = f"🤖 **Hermes (交付掌柜) · {time_str}**:\n{text}"
            
        try:
            api(f"/issues/{workshop_issue['id']}/comments", method="POST", data={"body": body})
            synced_count += 1
        except Exception as e:
            print(f"  ⚠️ 回填失败 ({mid}): {e}")
            
    print(f"✅ 工坊历史对话回填完成，共同步 {synced_count} 条核心记录！")
    
    agents = api(f"/companies/{company['id']}/agents")
    agent_list = agents if isinstance(agents, list) else agents.get("items", [])
    tiejiang = [a for a in agent_list if "铁匠" in a.get("name", "") or "Core SWE" in a.get("title", "")][0]
    
    tasks_to_create = [
        {
            "title": "[QQ] 修复文旅 Live 详情页及 telemetry client-log 400 异常",
            "desc": "【来源渠道】：QQ 掌柜即时指派\n\n- 目标：解决 /app/live/demo-live-001 访问异常与 client-log 400 Bad Request 报错\n- 指派员工：铁匠 (Core SWE) / agy 工具池联动\n- 关联会话：QQ 会话 20261011_142610_4d9afc",
            "priority": "critical"
        },
        {
            "title": "[QQ] 文旅 Next 登录页验证码与滑块校验及发布流水线标准化",
            "desc": "【来源渠道】：QQ 掌柜即时指派\n\n- 目标：修大眼蛙 wenlv-next dev 端 login page 拿验证码后滑块校验，并规范化标准部署流程 (Stage 1~5)\n- 指派员工：铁匠 (Core SWE)\n- 关联会话：QQ 会话 20261011_142610_4d9afc",
            "priority": "high"
        }
    ]
    
    for t in tasks_to_create:
        exists = any(t["title"] in (i.get("title", "") or "") for i in issue_list)
        if not exists:
            try:
                new_iss = api(f"/companies/{company['id']}/issues", method="POST", data={
                    "title": t["title"],
                    "description": t["desc"],
                    "status": "in_progress",
                    "priority": t["priority"],
                    "assigneeAgentId": tiejiang["id"]
                })
                ident = new_iss.get("identifier") or new_iss.get("id")
                print(f"✅ 成功补立看板工单: {ident} - {t['title']}")
                api(f"/issues/{workshop_issue['id']}/comments", method="POST", data={
                    "body": f"📌 **【QQ 通道任务已同步立项至看板】** [`{ident}`] {t['title']}\n> 责任员工：{tiejiang['name']} | 状态：in_progress"
                })
            except Exception as e:
                print(f"⚠️ 创建工单失败: {e}")
        else:
            print(f"ℹ️ 工单已存在，跳过重复创建: {t['title']}")

if __name__ == "__main__":
    main()
