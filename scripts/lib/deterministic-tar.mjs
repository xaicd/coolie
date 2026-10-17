/**
 * scripts/lib/deterministic-tar.mjs
 *
 * 可移植的确定性 .tar.gz 写入器 (纯 Node, 不调用系统 tar).
 *
 * 为什么需要它 (实测, 2026-10-18):
 *   视觉回归基线的打包路径原本调用
 *     tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
 *         --use-compress-program="gzip -n"
 *   这些是 GNU tar 专有旗标. macOS 自带的 bsdtar 直接报
 *     `tar: Option --sort=name is not supported`
 *   ⇒ `pnpm storybook-visual:baseline pack` 在每一台 Mac 上都是坏的,
 *     校验和固定的基线包只能在 Linux 上产出; 两个基线单测在 macOS 上同样红.
 *
 *   改用 BSD tar 的等价旗标也不行: libarchive 没有 `--mtime`, 无法把 mtime
 *   钉成 0, 同一批快照打两次包会得到两个 sha256 —— 校验和固定就失效了.
 *   所以确定性只能自己写: ustar 头 + 固定 mtime/uid/gid/mode + zlib gzip
 *   (Node 的 gzip 头写出 MTIME=0, 天然确定).
 *
 * 产物契约:
 *   - 条目按 POSIX 相对路径字节序排序 (与 `--sort=name` 同义);
 *   - 只写常规文件条目, 不写目录条目 (解包时由 tar 自动建父目录);
 *   - 每个文件 mode=0644, uid/gid=0, uname/gname 为空, mtime=0;
 *   - 路径超过 ustar 单字段上限时按 '/' 拆 prefix/name, 仍放不下就报错,
 *     绝不静默截断 (截断会让两个不同快照包撞成同一个 sha256).
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

const BLOCK = 512;
const NAME_MAX = 100;
const PREFIX_MAX = 155;

function writeOctal(buffer, value, offset, length) {
  // ustar 数字字段: 零填充八进制 + NUL. 长度 n 的字段放 n-1 位数字.
  const text = value.toString(8).padStart(length - 1, "0");
  if (text.length > length - 1) {
    throw new Error(`tar field overflow: ${value} does not fit in ${length - 1} octal digits`);
  }
  buffer.write(text, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

/** 把 POSIX 相对路径拆成 ustar 的 prefix/name 两段. */
function splitPath(path) {
  if (Buffer.byteLength(path, "utf8") <= NAME_MAX) return { prefix: "", name: path };
  for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(name, "utf8") <= NAME_MAX && Buffer.byteLength(prefix, "utf8") <= PREFIX_MAX) {
      return { prefix, name };
    }
  }
  throw new Error(`tar path too long for ustar (max ${PREFIX_MAX}+${NAME_MAX} bytes): ${path}`);
}

function buildHeader(path, size) {
  const buffer = Buffer.alloc(BLOCK, 0);
  const { prefix, name } = splitPath(path);

  buffer.write(name, 0, NAME_MAX, "utf8");
  writeOctal(buffer, 0o644, 100, 8); // mode
  writeOctal(buffer, 0, 108, 8); // uid
  writeOctal(buffer, 0, 116, 8); // gid
  writeOctal(buffer, size, 124, 12); // size
  writeOctal(buffer, 0, 136, 12); // mtime — 钉死为 0
  buffer.write("        ", 148, 8, "ascii"); // checksum placeholder (8 spaces)
  buffer.write("0", 156, 1, "ascii"); // typeflag: regular file
  buffer.write("ustar\0", 257, 6, "latin1"); // magic
  buffer.write("00", 263, 2, "ascii"); // version
  buffer.write(prefix, 345, PREFIX_MAX, "utf8");

  let checksum = 0;
  for (const byte of buffer) checksum += byte;
  buffer.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  buffer[154] = 0;
  buffer[155] = 0x20; // "space" terminator per POSIX
  return buffer;
}

function collectFiles(root, current = root) {
  const entries = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      entries.push(...collectFiles(root, absolute));
    } else if (entry.isFile()) {
      entries.push({ absolute, path: relative(root, absolute).split(sep).join("/") });
    }
    // 符号链接 / FIFO / socket 不进基线包: 快照目录里只有 PNG 与 manifest.
  }
  return entries;
}

/**
 * 把一个目录打成确定性 .tar.gz.
 *
 * @param {{sourceDir: string, outFile: string}} options
 * @returns {{entryCount: number, sha256: string, byteSize: number}}
 */
export function writeDeterministicTarGz({ sourceDir, outFile }) {
  if (!statSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Deterministic tar source is not a directory: ${sourceDir}`);
  }

  const files = collectFiles(sourceDir).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const chunks = [];

  for (const file of files) {
    const { size } = statSync(file.absolute);
    chunks.push(buildHeader(file.path, size));
    const body = readFileSync(file.absolute);
    chunks.push(body);
    const padding = (BLOCK - (size % BLOCK)) % BLOCK;
    if (padding > 0) chunks.push(Buffer.alloc(padding, 0));
  }

  chunks.push(Buffer.alloc(BLOCK * 2, 0)); // end-of-archive 两个全零块

  const archive = gzipSync(Buffer.concat(chunks), { level: 9 });
  writeFileSync(outFile, archive);

  return {
    entryCount: files.length,
    sha256: createHash("sha256").update(archive).digest("hex"),
    byteSize: archive.length,
  };
}
