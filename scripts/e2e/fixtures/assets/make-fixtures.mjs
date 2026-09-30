#!/usr/bin/env node
// Regenerates the bundled e2e fixtures:
//   - requirement-sample.docx  (a minimal, valid OOXML word-processing doc)
//   - artifact-sample.html     (a self-identifying page for the render check)
//
// The DOCX is built with a tiny, dependency-free ZIP writer so the fixture is
// reproducible on any checkout without adding a build dependency.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a valid ZIP archive (deflate entries) from [{ name, data:Buffer }]. */
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.data);
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data);
    const method = 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localHeader = Buffer.concat([local, name]);
    locals.push(localHeader, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, name]));

    offset += localHeader.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

function paragraph(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

const DOC_TITLE = "白鹭巡检平台需求说明书";
const DOC_PARAGRAPH =
  "本系统用于统一管理巡检计划、任务派发与结果归档，覆盖移动端外勤现场作业与后台运营管理。";

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  paragraph(DOC_TITLE) +
  paragraph(DOC_PARAGRAPH) +
  paragraph("建设目标") +
  paragraph("- 统一巡检计划管理") +
  paragraph("- 支持外勤移动端作业") +
  paragraph("- 交付结果自动归档") +
  `</w:body></w:document>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const rels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const docx = zip([
  { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
  { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
  { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
]);

fs.writeFileSync(path.join(HERE, "requirement-sample.docx"), docx);

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>wave137 artifact render probe</title>
  </head>
  <body>
    <h1 id="e2e-artifact-marker">wave137 artifact render probe</h1>
    <p id="e2e-artifact-text">rendered-content-ok</p>
  </body>
</html>
`;
fs.writeFileSync(path.join(HERE, "artifact-sample.html"), html);

console.log(`wrote ${path.join(HERE, "requirement-sample.docx")} (${docx.length} bytes)`);
console.log(`wrote ${path.join(HERE, "artifact-sample.html")}`);
