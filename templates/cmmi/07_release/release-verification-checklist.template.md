<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 投产上线发布走查清单 (checklist)
归属: CMMI Phase 07 (07_release)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 投产上线发布走查清单 (Release Verification Checklist)

- **归属规范**: CMMI 07_release (TRANS) / .agents/skills/cmmi-immutable-release

---

## 1. 双人复核走查项 (100% 勾选后方可投产)
- [ ] 7 处版本号源完全一致
- [ ] 自动化测试矩阵 100% 通过
- [ ] 不可变制品指纹已签名归档
- [ ] 秒级回滚 SOP 已通过演练核实
