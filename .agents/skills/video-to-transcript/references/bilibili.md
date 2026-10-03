# B 站下载：WAF、cookie 与限流

## WAF 拦截机制

B 站用 **header 指纹** 拦 `yt-dlp`，不是靠登录态。裸跑 `yt-dlp <url>` 会被拒（412 或直接失败）。

必须补的四个头（`scripts/bili_tx.sh` 已内置）：

```
--user-agent  Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
              (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0
--add-header  Referer:https://www.bilibili.com/
--add-header  Origin:https://www.bilibili.com
--add-header  Accept-Language:zh-CN,zh;q=0.9
```

要点：

- **UA 要伪装成 Edge**，不是随便一个 UA。普通 Chrome UA 也可能被拒。
- `Referer` 与 `Origin` 必须成对，只补一个仍会被拦。
- `Accept-Language` 缺失会让部分接口返回非中文内容。

## 何时需要 cookie

大多数公开视频**不需要** cookie。以下情况需要：

- 仅登录可见 / 会员可见的视频
- 充电专属、付费课程
- 需要更高清晰度时

cookie 是 **B 站登录态（SESSDATA）**，等同账号凭证：

- 导出步骤见 `docs/bili2text-cookie导出教程.md`
- 落地位置：`bili2text/cookies.txt`
- **已在 `bili2text/.git/info/exclude` 里排除，不会进 git**——但换 clone 时会丢，需要重新导出
- 不要把它复制到仓库其它位置；父仓库 `.gitignore` 虽有 `cookies.txt` 规则，
  但那是第二道防线，不是第一道

## 批量下载策略

- **串行，不要并发。** 并发会触发限流，反而更慢，且容易被临时封。
- **音频而非视频。** 用 `-f bestaudio/best -x --audio-format mp3 --audio-quality 5`，
  转写只需要音频，下视频是纯粹浪费带宽与磁盘。
- **分集用 `?p=N`。** 多 P 视频的每一 P 是一个独立 URL，`bili_tx.sh` 的第二个参数就是它。
- **已有音频会跳过下载**（`if [ ! -f "$AUDIO" ]`），所以中断后重跑只补缺的。

## 常见失败

| 报错 | 含义 | 处理 |
|---|---|---|
| `HTTP Error 412` | WAF 拦截 | 检查四个 header 是否齐全（尤其 UA 是不是 Edge） |
| `Sign in to confirm` / 需要登录 | 缺 cookie | 导出 cookie 放到 `bili2text/cookies.txt` |
| `This video is unavailable` | 地区限制或已删除 | 换源，不要反复重试 |
| 下载成功但音频为空 | 分集号不存在 | 确认 `?p=N` 的 N 有效 |
| 速度极慢 | 被限流 | 停一会再跑，别加并发 |

## 已验证的实例

- `BV1qyWyzeE1E` 共 43 集，整批下载 + 转写跑通，产物合并为 `out/tx/课程笔记.md`
  （333 K 字符量级），是当前最大的一次批量。
