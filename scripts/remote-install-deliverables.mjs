import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

const STORAGE_ROOT = "/home/ubuntu/.paperclip/instances/default/data/storage";
const COMPANY_ID = "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const AGENT_ID = "3e3dbce1-d8cb-47bd-af68-2872200ac509"; // Hermes

async function main() {
  const bundlePath = "/tmp/deliverables_bundle.json";
  if (!fs.existsSync(bundlePath)) {
    console.error(`Bundle not found at ${bundlePath}`);
    process.exit(1);
  }

  const deliverables = JSON.parse(fs.readFileSync(bundlePath, "utf-8"));
  console.log(`📦 收到 ${deliverables.length} 份交付物，准备注入生产存储与数据库...`);

  const client = new Client({
    database: "coolie",
    user: "postgres",
  });
  await client.connect();
  console.log("🔌 已连接生产 PostgreSQL 数据库 (coolie)");

  for (const item of deliverables) {
    const assetId = crypto.randomUUID();
    const attachmentId = crypto.randomUUID();
    const fileUuid = crypto.randomUUID();
    const objectKey = `${COMPANY_ID}/issues/${item.issueId}/2026/10/08/${fileUuid}-${item.filename}`;

    // 1. 物理写入 Storage 目录
    const absPath = path.join(STORAGE_ROOT, objectKey);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, item.content, "utf-8");
    console.log(`  💾 [写入磁盘] ${objectKey} (${item.byteSize} 字节)`);

    // 2. 插入 assets 表
    await client.query(
      `INSERT INTO assets (
        id, company_id, provider, object_key, content_type, byte_size, sha256,
        original_filename, created_by_agent_id, created_at, updated_at
      ) VALUES ($1, $2, 'local_disk', $3, 'text/markdown', $4, $5, $6, $7, NOW(), NOW())`,
      [
        assetId,
        COMPANY_ID,
        objectKey,
        item.byteSize,
        item.sha256,
        item.filename,
        AGENT_ID,
      ]
    );

    // 3. 插入 issue_attachments 表
    await client.query(
      `INSERT INTO issue_attachments (
        id, company_id, issue_id, asset_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [attachmentId, COMPANY_ID, item.issueId, assetId]
    );

    // 4. 构建 Work Product Metadata
    const metadata = {
      attachmentId: attachmentId,
      contentType: "text/markdown",
      byteSize: item.byteSize,
      contentPath: `/api/attachments/${attachmentId}/content`,
      openPath: `/api/attachments/${attachmentId}/content`,
      downloadPath: `/api/attachments/${attachmentId}/content?download=1`,
      relativePath: item.filename.includes("srs") || item.filename.includes("requirements")
        ? `docs/specs/${item.filename}`
        : item.filename.includes("hld") || item.filename.includes("lld") || item.filename.includes("contract")
        ? `docs/architecture/${item.filename}`
        : item.filename.includes("test")
        ? `docs/verification/${item.filename}`
        : item.filename.includes("deploy")
        ? `docs/release/${item.filename}`
        : `docs/specs/${item.filename}`,
      deliverableType: item.deliverableType,
    };

    // 5. 更新或插入 issue_work_products
    const existing = await client.query(
      `SELECT id FROM issue_work_products 
       WHERE issue_id = $1 
         AND (
           metadata->>'originalFilename' = $2 
           OR metadata->>'relativePath' LIKE '%' || $2
           OR title ILIKE '%' || $3 || '%'
         )
       LIMIT 1`,
      [item.issueId, item.filename, item.filename.replace(".md", "")]
    );

    if (existing.rows.length > 0) {
      const wpId = existing.rows[0].id;
      await client.query(
        `UPDATE issue_work_products SET
          title = $2,
          summary = $3,
          type = 'artifact',
          provider = 'attachment',
          status = 'approved',
          review_state = 'approved',
          is_primary = true,
          content_sha256 = $4,
          metadata = $5,
          updated_at = NOW()
        WHERE id = $1`,
        [wpId, item.title, item.summary, item.sha256, JSON.stringify(metadata)]
      );
      console.log(`  🔄 [更新工件] [${item.identifier}] ${item.title} -> WorkProduct ${wpId} (Attachment ${attachmentId})`);
    } else {
      const newWpId = crypto.randomUUID();
      await client.query(
        `INSERT INTO issue_work_products (
          id, company_id, project_id, issue_id, type, provider, title,
          status, review_state, is_primary, summary, metadata, content_sha256,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'artifact', 'attachment', $5,
          'approved', 'approved', true, $6, $7, $8, NOW(), NOW()
        )`,
        [
          newWpId,
          COMPANY_ID,
          item.projectId,
          item.issueId,
          item.title,
          item.summary,
          JSON.stringify(metadata),
          item.sha256,
        ]
      );
      console.log(`  ✨ [新建工件] [${item.identifier}] ${item.title} -> WorkProduct ${newWpId} (Attachment ${attachmentId})`);
    }
  }

  await client.end();
  console.log("\n✅ 生产数据与工件总线同步完成！");
}

main().catch((err) => {
  console.error("❌ 执行失败:", err);
  process.exit(1);
});
