# Brief: wave 99 — E2E 真验 web 登录 + 后续访问 + 后台鉴权 (boss 23:42 派 '你得先e2e 测试下')

PM: Jason
Worker: claude

## 0. Boss 09-26 23:42 OOB 「你得先e2e 测试下web登录，及后续访问，后台鉴权」

老板让 PM 派 e2e 测试, 完整模拟"老板装 APK → 登录 → 点 CMMI 门禁 → WebView 自动登录 → 后续 web 访问真值".

## 1. 目标

**E2E 真值测试 wave99** (出真修才打包):

A. **真验 server /api/auth/exchange 完整链路**:
   - 拿真 cookie + 真 token → /api/auth/exchange → 302 + Set-Cookie
   - 用 cookie → /api/auth/get-session → 200 (user)
   - 用 cookie → /api/companies → 200 (companies 列表)
   - 用 cookie → /api/companies/:id/dashboard → 200 (真数据)
   - 用 cookie → /api/agents → 200
   - 用 cookie → /XROA/ontology → 200 (HTML 真页面)
   - 用 cookie → /XROA/projects → 200 (HTML 真页面)

B. **真验 WebContainerScreen 链路**:
   - adb 装 0.5.69 APK (当前最新)
   - 启动 → 登录 (老板账号)
   - 点进入 CMMI 门禁 → WebContainerScreen
   - adb logcat 抓 [bridge] token + URL 真值
   - 看 WebView 是否自动登录 web (不再看到登录页)

C. **如真有问题, 修真因 + 0.5.70**:
   - 若 cookie 没带到 web: 修真因
   - 若 WebView cookie 没持久: 修真因
   - 若 server 端有 bug: 修真因

D. **E2E 报告**:
   - 真截图真值
   - 真 logcat trace
   - 真 server log trace

## 2. 任务 (5 步)

### 2.1 server 端 E2E 真验

1. cd ~/workspace/xaicd/coolie
2. 用 curl 真验完整链路:
   - 真验 1: 登录拿 cookie
     curl -X POST -H "Content-Type: application/json" -d '{"email":"robinschen1989@gmail.com","password":"[REDACTED]"}' -c /tmp/cookies.txt https://xrobinai.cn/api/auth/sign-in/email
   - 真验 2: 用 cookie 调 get-session
     curl -b /tmp/cookies.txt https://xrobinai.cn/api/auth/get-session
   - 真验 3: 用 cookie 调 /api/companies
     curl -b /tmp/cookies.txt https://xrobinai.cn/api/companies
   - 真验 4: 用 cookie 调 /api/companies/:id/dashboard
     curl -b /tmp/cookies.txt https://xrobinai.cn/api/companies/4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e/dashboard
   - 真验 5: 用 cookie 调 /api/auth/exchange?token=xxx&next=/XROA/projects
     curl -b /tmp/cookies.txt -i 'https://xrobinai.cn/api/auth/exchange?token=[REDACTED]&next=/XROA/projects'
   - 真验 6: 用返回 cookie 调 /api/auth/get-session 验真登录

### 2.2 App 端 E2E 真验 (adb)

1. adb install emulator-5554 0.5.69 APK
2. adb logcat -c
3. 启动 App → 登录
4. 点进入 CMMI 门禁
5. adb logcat | grep -E '\[bridge\]|WebContainer|fetchReleaseNotes'
6. 看 WebView 是否自动登录 web
7. 截图真值

### 2.3 排查 WebView cookie 持久化真因 (如有问题)

按排查真因修:
- WebView cookie 持久化
- JSBridge (75929afe0 加)
- AndroidManifest 配置
- sharedCookiesEnabled / thirdPartyCookiesEnabled

### 2.4 修 + 打包 (如需) 0.5.70

1. 修法按排查结果
2. bump 0.5.69 → 0.5.70
3. 打包 + coscli + version.json + publish-ota

### 2.5 报告 + commit + push

1. E2E 报告 (真截图 + logcat + server log)
2. commit + push

## 3. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.70 之外 (除非真修必要)
- ❌ DON'T 改 boss Claude 后 commit / wave84-98 release
- ✅ DO E2E 真验
- ✅ DO 修真因
- ✅ DO 用 zsh-safe single quotes

## 4. semver + PM-CHECKLIST

- 当前 0.5.69
- 修真因 = patch bump → 0.5.70 (如需)
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 5. Done definition

5 步全完 + server E2E 真验 + App E2E 真验 + 真截图 + 真 logcat + 真 server log + 真修 (如需) + 0.5.70 真发版 + commit + push:

```
Coolie工坊 0.5.70: https://dls.xrobinai.cn/coolie/app/0.5.70/coolie-release.apk    (如修真因)
```