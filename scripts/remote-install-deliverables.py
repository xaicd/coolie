#!/usr/bin/env python3
import json
import os
import uuid
import subprocess

STORAGE_ROOT = "/home/ubuntu/.paperclip/instances/default/data/storage"
COMPANY_ID = "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e"
AGENT_ID = "3e3dbce1-d8cb-47bd-af68-2872200ac509"

def run_sql(query):
    p = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-d", "coolie", "-v", "ON_ERROR_STOP=1"],
        input=query,
        text=True,
        capture_output=True
    )
    if p.returncode != 0:
        print("SQL ERROR:", p.stderr)
        raise RuntimeError(f"psql failed: {p.stderr}")
    return p.stdout

def sql_escape(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"

def main():
    bundle_path = "/tmp/deliverables_bundle.json"
    with open(bundle_path, "r", encoding="utf-8") as f:
        deliverables = json.load(f)

    print(f"📦 载入 {len(deliverables)} 份交付物...")

    for item in deliverables:
        asset_id = str(uuid.uuid4())
        attachment_id = str(uuid.uuid4())
        file_uuid = str(uuid.uuid4())
        object_key = f"{COMPANY_ID}/issues/{item['issueId']}/2026/10/08/{file_uuid}-{item['filename']}"

        # 1. 物理写入 Storage
        abs_path = os.path.join(STORAGE_ROOT, object_key)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(item["content"])
        print(f"  💾 [写入磁盘] {object_key} ({item['byteSize']} 字节)")

        # 2. 插入 assets 表
        sql_insert_asset = f"""
        INSERT INTO assets (
            id, company_id, provider, object_key, content_type, byte_size, sha256,
            original_filename, created_by_agent_id, created_at, updated_at
        ) VALUES (
            {sql_escape(asset_id)},
            {sql_escape(COMPANY_ID)},
            'local_disk',
            {sql_escape(object_key)},
            'text/markdown',
            {item['byteSize']},
            {sql_escape(item['sha256'])},
            {sql_escape(item['filename'])},
            {sql_escape(AGENT_ID)},
            NOW(), NOW()
        );
        """
        run_sql(sql_insert_asset)

        # 3. 插入 issue_attachments 表
        sql_insert_attachment = f"""
        INSERT INTO issue_attachments (
            id, company_id, issue_id, asset_id, created_at, updated_at
        ) VALUES (
            {sql_escape(attachment_id)},
            {sql_escape(COMPANY_ID)},
            {sql_escape(item['issueId'])},
            {sql_escape(asset_id)},
            NOW(), NOW()
        );
        """
        run_sql(sql_insert_attachment)

        # 4. 构建 Work Product Metadata
        metadata = {
            "attachmentId": attachment_id,
            "contentType": "text/markdown",
            "byteSize": item["byteSize"],
            "contentPath": f"/api/attachments/{attachment_id}/content",
            "openPath": f"/api/attachments/{attachment_id}/content",
            "downloadPath": f"/api/attachments/{attachment_id}/content?download=1",
            "relativePath": (
                f"docs/specs/{item['filename']}" if ("srs" in item["filename"] or "requirements" in item["filename"])
                else f"docs/architecture/{item['filename']}" if ("hld" in item["filename"] or "lld" in item["filename"] or "contract" in item["filename"])
                else f"docs/verification/{item['filename']}" if "test" in item["filename"]
                else f"docs/release/{item['filename']}" if "deploy" in item["filename"]
                else f"docs/specs/{item['filename']}"
            ),
            "deliverableType": item["deliverableType"],
        }
        metadata_json = json.dumps(metadata, ensure_ascii=False)

        # 5. 更新或插入 issue_work_products
        # 先检查是否存在
        check_sql = f"""
        SELECT id FROM issue_work_products 
        WHERE issue_id = {sql_escape(item['issueId'])}
          AND (
            metadata->>'originalFilename' = {sql_escape(item['filename'])}
            OR metadata->>'relativePath' LIKE {sql_escape('%' + item['filename'])}
            OR title ILIKE {sql_escape('%' + item['filename'].replace('.md', '') + '%')}
          )
        LIMIT 1;
        """
        out = run_sql(check_sql).strip()
        lines = [line.strip() for line in out.split("\n") if line.strip() and not line.startswith("-") and not line.startswith("id") and not line.startswith("(")]

        if lines:
            wp_id = lines[0]
            update_sql = f"""
            UPDATE issue_work_products SET
                title = {sql_escape(item['title'])},
                summary = {sql_escape(item['summary'])},
                type = 'artifact',
                provider = 'attachment',
                status = 'approved',
                review_state = 'approved',
                is_primary = true,
                content_sha256 = {sql_escape(item['sha256'])},
                metadata = {sql_escape(metadata_json)},
                updated_at = NOW()
            WHERE id = {sql_escape(wp_id)};
            """
            run_sql(update_sql)
            print(f"  🔄 [更新工件] [{item['identifier']}] {item['title'][:25]} -> WP {wp_id} (Attachment {attachment_id})")
        else:
            new_wp_id = str(uuid.uuid4())
            insert_sql = f"""
            INSERT INTO issue_work_products (
                id, company_id, project_id, issue_id, type, provider, title,
                status, review_state, is_primary, summary, metadata, content_sha256,
                created_at, updated_at
            ) VALUES (
                {sql_escape(new_wp_id)},
                {sql_escape(COMPANY_ID)},
                {sql_escape(item['projectId'])},
                {sql_escape(item['issueId'])},
                'artifact',
                'attachment',
                {sql_escape(item['title'])},
                'approved',
                'approved',
                true,
                {sql_escape(item['summary'])},
                {sql_escape(metadata_json)},
                {sql_escape(item['sha256'])},
                NOW(), NOW()
            );
            """
            run_sql(insert_sql)
            print(f"  ✨ [新建工件] [{item['identifier']}] {item['title'][:25]} -> WP {new_wp_id} (Attachment {attachment_id})")

    print("\n✅ 生产数据库与附件总线同步 100% 成功！")

if __name__ == "__main__":
    main()
