# 备案合规与公网部署（ICP Compliance）

> 面向在中国大陆境内提供服务的部署。核心要求只有两条：**站点要能公开访问且内容与备案一致**，**备案号要展示在网站上并链接到工信部**。
> 本文件描述本仓库为此提供的开关，以及部署时的配置方式。

## 1. 环境变量

全部可选。**不设置时，实例行为与上游完全一致** —— 这条保证了一个不带备案的部署不需要知道这些变量的存在。

| 变量 | 示例 | 作用 |
|---|---|---|
| `PAPERCLIP_ICP_LICENSE` | `京ICP备2026000000号-1` | ICP 备案号。设置后在页面页脚展示，并链接到 `https://beian.miit.gov.cn/` |
| `PAPERCLIP_ICP_PUBLIC_SECURITY` | `京公网安备11010000000000号` | 公安备案号（可选）。展示并链接到 `https://beian.mps.gov.cn/` |
| `PAPERCLIP_LANDING_ENABLED` | `true` | 在 `/` 提供公开落地页。未设置时 `/` 仍返回应用本体 |
| `PAPERCLIP_LANDING_SITE_NAME` | `小陈的技术分享` | 落地页的站点名与浏览器标题。**应与备案的「服务名称」一致** |

值中的首尾空白会被忽略；空白值等同于未设置。

> 备案号**不进代码库**。本仓库是 MIT fork，个人/企业的备案号属于部署配置，通过环境变量注入。

## 2. 备案号展示在哪

两处，覆盖「核查者看到的所有入口」：

1. **公开落地页 `/`** —— 未登录即可访问，页脚含备案号。
2. **应用外壳（所有 SPA 路由）** —— 服务端在返回 `index.html` 时注入页脚，任意路由（如 `/auth`、`/dashboard`）的页面源码里都能看到备案号。

实现方式是在 `ui/index.html` 的标记块之间做服务端注入：

```html
<!-- PAPERCLIP_ICP_FOOTER_START -->
<!-- PAPERCLIP_ICP_FOOTER_END -->
```

由 `server/src/ui-branding.ts` 的 `applyUiBranding()` 填充，与既有的 favicon / runtime-branding 注入走同一条路径。因此它**不依赖前端构建产物**，改环境变量重启即可生效。

## 3. 公开落地页

`PAPERCLIP_LANDING_ENABLED=true` 时，`/` 返回一个服务端渲染的静态页：

- **免登录可见** —— 不受应用的访问网关约束，这是备案核查的前提
- **零外部请求** —— 不引用 Google Fonts / CDN，规避境内网络与额外备案问题
- **无客户端 JS** —— 爬虫与核查者拿到的是真实内容，而不是空壳
- **`/index.html` 与其余路由不受影响** —— 落地页只占用 `/`，应用入口仍是 `/auth`

站点名取 `PAPERCLIP_LANDING_SITE_NAME`，**应与备案「服务名称」保持一致**。平台自身名称（Coolie）作为副标题展示，两者分离，所以对齐备案不需要改名产品。

## 4. 反向代理

面向公网时建议 `PAPERCLIP_BIND=loopback` + 反代终止 TLS：

```caddyfile
{
	email <运维邮箱>
	acme_ca https://acme-v02.api.letsencrypt.org/directory
}

example.com, www.example.com {
	encode gzip zstd
	reverse_proxy 127.0.0.1:3100
}
```

要点：

- **显式指定 `acme_ca` 为生产目录**。默认值虽也是生产，但显式写明可避免历史配置残留导致签出 staging 证书（浏览器不信任）。
- **`www` 子域要有站点块**。只加 DNS 解析而不加站点块，SNI 匹配失败会直接握手中断。
- **`reverse_proxy` 自带 WebSocket 升级**，平台的实时更新不需要额外配置。
- 应用侧需配 `PAPERCLIP_PUBLIC_URL=https://example.com`（`authenticated` + `public` 模式要求显式公网地址）与 `PAPERCLIP_ALLOWED_HOSTNAMES`。

国内环境两个常见坑：

- **未备案域名的拦截页**。备案通过前，ACME 的 http-01 校验会拿到运营商/DNSPod 的拦截页，tls-alpn-01 会被 reset，表现为「证书一直签不下来」。备案通过后重试即可；仍失败则改用 **DNS-01**（需要带对应 DNS provider 模块的 Caddy 构建），可绕开 80/SNI 拦截，是最稳的方案。
- **退避**。Caddy 签发失败后会指数退避（最长 6 小时一次）。改完配置要 `systemctl restart caddy` 清掉退避计数，而不是等它自己重试。

## 5. 公安备案

ICP 备案通过后，通常需在 30 天内在[全国互联网安全管理服务平台](https://beian.mps.gov.cn/)办理公安联网备案。办完把号填进 `PAPERCLIP_ICP_PUBLIC_SECURITY`，页脚会自动多出一行。

## 6. 主体性质

备案主体分「个人」与「单位」。**个人备案不得用于经营性内容**（收费服务、在线交易等）。若平台对外提供有偿服务，需评估是否变更备案主体，这属于备案侧动作，代码层面不涉及。

## 7. 变更备案号

```sh
# 编辑 systemd 单元的环境变量，然后
sudo systemctl restart coolie
```

不需要重新构建前端。

## 8. 验证

```sh
# 落地页免登录可见，且含备案号与工信部链接
curl -sS https://example.com/        | grep -o '京ICP备[^<]*'
curl -sS https://example.com/        | grep -o 'beian.miit.gov.cn'

# 应用外壳任意路由同样含备案号
curl -sS https://example.com/auth    | grep -o '京ICP备[^<]*'

# 证书必须是生产 CA 签发
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -issuer -dates
```
