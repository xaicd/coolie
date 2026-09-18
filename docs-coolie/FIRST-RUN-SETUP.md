# 首次部署：把实例交给自己之前的三件事

适用对象：`PAPERCLIP_DEPLOYMENT_MODE=authenticated` 的实例（也就是我们线上那套，以及每个客户实例）。
`local_trusted` 模式不用看这份——它自带本地 board 管理员。

## 为什么需要这份

新实例启动后**没有任何 instance_admin**。健康端点会这样报：

```sh
curl -s https://<域名>/api/health | python3 -m json.tool | grep -E "bootstrapStatus|bootstrapInviteActive"
#   "bootstrapStatus": "bootstrap_pending",
#   "bootstrapInviteActive": false
```

这个状态下网页只能显示引导页。而且**公网暴露的实例不允许网页认领**——
`server/src/routes/access.ts` 的 `POST /api/bootstrap/claim` 要求
`deploymentMode === "authenticated" && deploymentExposure === "private"`，
公网实例拿到的是一句 "Browser first-admin claim is not available"。
这是有意的：否则谁先打开页面谁就是管理员。

所以公网实例只有两条正当路径，二选一即可。

## 路径一（推荐）：钉一个管理员邮箱

在宿主机的 unit 里加一行，之后**用这个邮箱注册或登录的任何一次**都会自动授予 instance_admin：

```sh
sudo systemctl edit coolie
```

```ini
[Service]
Environment=PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL=you@example.com
Environment=PAPERCLIP_AUTH_DISABLE_SIGN_UP=true
```

```sh
sudo systemctl daemon-reload && sudo systemctl restart coolie
```

- 授权只会在**实例还没有任何管理员**时发生，且底层用的是 `claimFirstInstanceAdmin`
  （带表锁、只能成功一次），所以两个并发的首次登录不会都拿到管理员。
- **邮箱大小写和前后空格都会被规范化**，`You@Example.com` 与 `you@example.com` 等价。
- 登出再登一次也行：账号先存在、邮箱后钉上，同样会在**下一次登录**时生效。
- 授权成功会在服务日志里留一行
  `Granted first instance admin from PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL`。

**为什么同时关注册**：密码注册**不验证邮箱归属**（`requireEmailVerification: false`，
本套部署也没配 SMTP）。开放注册 + 钉了邮箱 = 谁抢先用那个地址注册成功，谁就是管理员。
关掉注册后，账号只能由管理员邀请创建，"抢注"这条路就没有了。

## 路径二：一次性邀请链接

```sh
npx paperclipai auth bootstrap-ceo --base-url https://<域名>
```

它打印一条 `https://<域名>/invite/pcp_bootstrap_...`，在浏览器里打开即完成认领。
链接**默认 72 小时**过期，且一次只能有一张有效票（再生成会自动吊销上一张）。
`paperclipai run` 启动时若实例仍是 `bootstrap_pending`，也会自动生成一张并打进启动日志——
所以先翻日志往往就能找到，不必再跑命令。

## 验证

```sh
# 1) 状态从 bootstrap_pending 变成 ready
curl -s https://<域名>/api/health | python3 -m json.tool | grep bootstrapStatus

# 2) 日志里有没有那行授权记录
sudo journalctl -u coolie --since "-10 min" | grep -i "instance admin"
```

## 改完别忘了

`PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` 之后，新增用户只能走**邀请**：
管理员在 Settings → Access 里发邀请。客户开通同理——这也是多公司形态下
"按模板开客户"应有的入口。
