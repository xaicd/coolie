# Coolie 版本命名规则（semver 三段语义）— 2026-09-21

> 老板：「为啥每个版本名称都一样」= 我们之前没严格 semver，导致 patch / feature / breaking 看起来都像 0.5.x。
> 拍板：从 0.6.0 起强制三段语义。

---

## 1. 三段语义（强制）

```
patch bump: 0.5.X → 0.5.(X+1)   = HOTFIX (修 bug, 加 UI 组件, 装机自检屏)
minor bump: 0.X.0 → 0.(X+1).0   = FEATURE (新功能模块, 5 角色, ChatHome)
major bump: X.0.0 → (X+1).0.0   = BREAKING (架构调整, 协议变更, 强制升级)
```

| 改动类型 | 应该 bump | 例子 |
|---|---|---|
| 修 bug / 修 OTA bug / 加 UI 屏 | patch | `0.5.1 → 0.5.2` ✅ WhatsNewScreen（hotfix）|
| 加 5 角色 / ChatHome / DS 否决 | minor | `0.5.0 → 0.6.0` ⚠️ 我们跳过这步直接 0.5.1 |
| 改 schema / 改协议 / 强制升级 | major | `0.5.x → 1.0.0`（future）|

## 2. 历史回顾（待回溯标定）

| 实际版本 | 应该版本 | 偏离 |
|---|---|---|
| 0.3.0 (09-13) | 0.3.0 ✅ | baseline |
| 0.3.1 - 0.3.5 (09-13~09-15) | 0.3.1 - 0.3.5 ✅ patch 连续 | OK |
| 0.5.0 (09-20) | 0.4.0 | 我们跳 0.4.x，应至少经过 0.4.0 |
| 0.5.1 (09-21) | **0.6.0** | 5 角色 + DS veto + 全套 ChatHome = 重大功能模块 |
| 0.5.2 (09-21) | 0.6.1 | WhatsNewScreen + coolie:// = 真 patch |

**结论：0.5.0 之前 → 0.6.0（minor bump），0.5.1 → 0.6.1（patch）。**

但**已发出去**了，不能改名。**以后从 0.7.0 起严格 semver。**

## 3. release-app.sh 加 sanity check

```bash
#!/bin/bash
NEW_VERSION=$1
PREV_VERSION=$(git tag --list 'v*' | sort -V | tail -1 | sed 's/v//')

# Parse semver components
IFS='.' read -ra NEW <<< "$NEW_VERSION"
IFS='.' read -ra PREV <<< "$PREV_VERSION"

if [[ "${NEW[0]}" != "${PREV[0]}" ]] && [[ "${NEW[1]}" == "0" ]] && [[ "${NEW[2]}" == "0" ]]; then
  echo "[semver] MAJOR bump detected ($PREV_VERSION → $NEW_VERSION) — confirm:"
  echo "  1. 架构重大调整"
  echo "  2. 协议/契约变更"
  echo "  3. 必须强制用户升级"
  read -p "Press enter to continue if all 3 true"
fi
```

## 4. PM-RELEASE-CHECKLIST 同步

`docs-coolie/PM-RELEASE-CHECKLIST.md` 加：
- [ ] **version bump 符合 semver 语义**（patch/minor/major 三选一，有理由）

## 5. Done definition

- [ ] release-app.sh 加 semver sanity check
- [ ] PM-RELEASE-CHECKLIST 加 semver 行
- [ ] COMMIT 引用本 spec
- [ ] 老板装机看到 0.5.2 (现行) → 下次发版本应是 0.6.x (patch) 或 0.7.0 (minor)

## 6. 当前生产状态（解释老板感觉「都一样」）

| 设备 | 显示版本 | 实际意义 |
|---|---|---|
| 老板手机 0.5.2 (502) | 0.5.2 | WhatsNewScreen + coolie:// = **真 hotfix** |
| 老 0.5.0 (500) | 0.5.0 | ChatHome preview + workspace = **should have been 0.6.0** |
| 0.5.1 (501) | 0.5.1 | 5 角色 + DS veto = **should have been 0.6.0** |
| 0.3.5 | 0.3.5 | 语音派发 hotfix |

老板的直觉是对的——0.5.1 应该叫 0.6.0。但已发，不能改。**以后从下次发版起严格执行。**