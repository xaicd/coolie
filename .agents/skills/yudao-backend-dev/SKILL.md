---
name: yudao-backend-dev
description: Yudao-Cloud (芋道后端微服务与单体开发法典)。深度拆解 Spring Boot 3 / JDK 17 底层架构，指导数字员工遵循标准的 6 层解耦规范、多企业租户物理隔离拦截器、行级数据权限 (@DataPermission)、防重幂等 (@Idempotent)、MyBatis-Plus-Join 复合查询、Knife4j OpenAPI 3 契约注释与事务缓存双写一致性标准。
---

# Yudao-Cloud 核心后端架构与业务模块深度研发法典

> **最高法典契约**：任何数字员工（铁匠 CoreSWE、墨斗 FDA）在研发、二开或重构 `yudao-quad-terminal` 后端模块时，必须严格执行本法典。严禁破坏 6 层架构边界，严禁在 Controller 编写 SQL 或业务逻辑，严禁跳过租户隔离拦截器，写操作必须加设 `@Transactional` 与 `@OperateLog`，所有对外 API 必须标注 Knife4j 契约与 `@PreAuthorize` 权限。

---

## §0 ⚡ AI 数字员工 Token 极限节约通道 (LLM Token-Saving Fast Track)

针对大型企业级 Java 中台在多智能体协作时易发生的**“全盘盲扫爆输入、手工样板爆输出、人肉比对爆审计”**三大 Token 灾难，本基座沉淀了三大开箱即用自动化脚本：

1. **业务切片秒读 (省 95% 输入 Token)**:
   ```bash
   # 获取某个业务域的极简切片 (Controller, Endpoints, Table Columns, Frontend API)
   pnpm ctx:query <keyword>
   # 或直接调用
   node scripts/agent-context-compressor.mjs <keyword>
   ```
   *输出仅占 ~150 Tokens，直接杜绝通读动辄几十个 Java 类的 Token 灾难。*

2. **极速工业级代码生成 (省 90% 输出 Token)**:
   ```bash
   pnpm gen:module \
     --module <module-name> \
     --entity <EntityName> \
     --table <table_name> \
     --title "<业务标题>" \
     --fields "<name>:<type>:<comment>:<flags>,..."
   ```
   *参数说明*:
   - `--fields`: 逗号分隔字段，格式为 `name:type:comment:flags`
     - 类型: `string`, `long`, `integer`, `boolean`, `decimal`, `datetime`, `text`
     - 标志: `req` (必填/校验注解), `search` (分页查询参数), `hidden` (隐藏列)
   *生成成果*: 100ms 确定性生成 12 项工业标准文件 (DO, Mapper, Service, ServiceImpl, Controller, 3*VO, Convert, Vue3 View, TS API, SQL DDL)，AI 仅需用少量 Token 审查或填充业务算法。

3. **前后端契约防漂移静态审计 (省 80% 审计 Token)**:
   ```bash
   pnpm check:drift
   # 严格模式 (任何未封装接口均报错拦截)
   node scripts/check-contracts-drift.mjs --strict
   ```
   *0.1 秒静态扫描 Spring MVC 路由与 TS API 客户端，确定性输出差异，严禁人工将代码贴入提示词比对！*

---

## §1 核心源码架构解耦与 6 层分工模型

Yudao 框架的核心哲学是**“严格分层、编译期强类型、无反射开销、自闭环测试”**：

```
                      【Yudao 标准 6 层工程流转拓扑】

┌────────────────────────────────────────────────────────────────────────┐
│ 1. Controller 控制器层                                                 │
│    • 职责: URL 路由绑定、入参校验 (@Valid)、权限校验 (@PreAuthorize)    │
│    • 规范: 只调用 Service，禁止调用 Mapper；统一包装 CommonResult<T>  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ 传递 Clean DTO / VO
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Service 业务接口层 & 3. ServiceImpl 业务实现层                       │
│    • 职责: 纯净业务逻辑、声明式事务 (@Transactional)、分布式锁编排   │
│    • 规范: 涉及写操作必须保证幂等；数据组装通过 MapStruct 进行 Convert │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ 传递持久化实体 DO
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. Mapper 持久层                                                       │
│    • 职责: 继承 BaseMapperX<T>，使用 LambdaQueryWrapperX 进行类型安全查询 │
│    • 规范: 杜绝硬编码列名字符串，杜绝无分页大表查询                    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ 读写数据库物理表
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. DO (DataObject) 数据实体层                                          │
│    • 职责: 继承 BaseDO 或 TenantBaseDO，映射数据库表字段               │
│    • 规范: 严格包含 id, creator, create_time, updater, deleted 审计字段 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## §2 真实业务模块完整落地全套代码范例 (以会员收货地址为例)

以下代码是一套符合 Yudao 工业标准的完整业务闭环，可直接作为代码生成与手写的标准模板：

### 1. 实体定义层 (`MemberAddressDO.java`)
```java
package cn.iocoder.yudao.module.member.dal.dataobject.address;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.*;

/**
 * 用户收货地址 DO
 */
@TableName("member_address")
@Data
@EqualsAndHashCode(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MemberAddressDO extends TenantBaseDO {

    /**
     * 地址编号 (自增主键)
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 用户编号
     */
    private Long userId;

    /**
     * 收件人姓名
     */
    private String name;

    /**
     * 手机号码
     */
    private String mobile;

    /**
     * 省份编码
     */
    private Long areaId;

    /**
     * 详细地址
     */
    private String detailAddress;

    /**
     * 是否默认地址 (0: 否, 1: 是)
     */
    private Boolean defaultStatus;
}
```

### 2. 持久层接口 (`MemberAddressMapper.java`)
```java
package cn.iocoder.yudao.module.member.dal.mysql.address;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.member.controller.admin.address.vo.AddressPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.address.MemberAddressDO;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface MemberAddressMapper extends BaseMapperX<MemberAddressDO> {

    default PageResult<MemberAddressDO> selectPage(AddressPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<MemberAddressDO>()
                .eqIfPresent(MemberAddressDO::getUserId, reqVO.getUserId())
                .likeIfPresent(MemberAddressDO::getName, reqVO.getName())
                .likeIfPresent(MemberAddressDO::getMobile, reqVO.getMobile())
                .orderByDesc(MemberAddressDO::getId));
    }

    default List<MemberAddressDO> selectListByUserId(Long userId) {
        return selectList(new LambdaQueryWrapperX<MemberAddressDO>()
                .eq(MemberAddressDO::getUserId, userId)
                .orderByDesc(MemberAddressDO::getDefaultStatus)
                .orderByDesc(MemberAddressDO::getId));
    }
}
```

### 3. 数据传输对象 (VO / DTO)
```java
package cn.iocoder.yudao.module.member.controller.admin.address.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Schema(description = "管理后台 - 收货地址创建 Request VO")
@Data
public class AddressCreateReqVO {

    @Schema(description = "用户编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1024")
    @NotNull(message = "用户编号不能为空")
    private Long userId;

    @Schema(description = "收件人姓名", requiredMode = Schema.RequiredMode.REQUIRED, example = "张三")
    @NotBlank(message = "收件人姓名不能为空")
    private String name;

    @Schema(description = "手机号码", requiredMode = Schema.RequiredMode.REQUIRED, example = "13800138000")
    @NotBlank(message = "手机号码不能为空")
    private String mobile;

    @Schema(description = "地区编码", requiredMode = Schema.RequiredMode.REQUIRED, example = "110101")
    @NotNull(message = "地区编码不能为空")
    private Long areaId;

    @Schema(description = "详细地址", requiredMode = Schema.RequiredMode.REQUIRED, example = "中关村南大街 1 号院")
    @NotBlank(message = "详细地址不能为空")
    private String detailAddress;

    @Schema(description = "是否默认地址", requiredMode = Schema.RequiredMode.REQUIRED, example = "true")
    @NotNull(message = "默认地址状态不能为空")
    private Boolean defaultStatus;
}
```

### 4. 对象转换层 (`AddressConvert.java` - MapStruct)
```java
package cn.iocoder.yudao.module.member.convert.address;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.member.controller.admin.address.vo.AddressCreateReqVO;
import cn.iocoder.yudao.module.member.controller.admin.address.vo.AddressRespVO;
import cn.iocoder.yudao.module.member.dal.dataobject.address.MemberAddressDO;
import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;
import org.mapstruct.factory.Mappers;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface AddressConvert {

    AddressConvert INSTANCE = Mappers.getMapper(AddressConvert.class);

    MemberAddressDO convert(AddressCreateReqVO bean);

    AddressRespVO convert(MemberAddressDO bean);

    PageResult<AddressRespVO> convertPage(PageResult<MemberAddressDO> page);
}
```

### 5. 业务实现层 (`AddressServiceImpl.java`)
```java
package cn.iocoder.yudao.module.member.service.address;

import cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.member.controller.admin.address.vo.AddressCreateReqVO;
import cn.iocoder.yudao.module.member.controller.admin.address.vo.AddressPageReqVO;
import cn.iocoder.yudao.module.member.convert.address.AddressConvert;
import cn.iocoder.yudao.module.member.dal.dataobject.address.MemberAddressDO;
import cn.iocoder.yudao.module.member.dal.mysql.address.MemberAddressMapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import javax.annotation.Resource;

import static cn.iocoder.yudao.module.member.enums.ErrorCodeConstants.ADDRESS_NOT_EXISTS;

@Service
@Validated
public class AddressServiceImpl implements AddressService {

    @Resource
    private MemberAddressMapper addressMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createAddress(AddressCreateReqVO createReqVO) {
        // 1. 如果设置为默认地址，先把该用户原有的默认地址取消
        if (Boolean.TRUE.equals(createReqVO.getDefaultStatus())) {
            addressMapper.update(null, new LambdaUpdateWrapper<MemberAddressDO>()
                    .eq(MemberAddressDO::getUserId, createReqVO.getUserId())
                    .set(MemberAddressDO::getDefaultStatus, false));
        }

        // 2. 插入新地址
        MemberAddressDO address = AddressConvert.INSTANCE.convert(createReqVO);
        addressMapper.insert(address);
        return address.getId();
    }

    @Override
    public PageResult<MemberAddressDO> getAddressPage(AddressPageReqVO pageReqVO) {
        return addressMapper.selectPage(pageReqVO);
    }
}
```

### 6. 控制器层 (`AddressController.java`)
```java
package cn.iocoder.yudao.module.member.controller.admin.address;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.operatelog.core.annotations.OperateLog;
import cn.iocoder.yudao.module.member.controller.admin.address.vo.*;
import cn.iocoder.yudao.module.member.convert.address.AddressConvert;
import cn.iocoder.yudao.module.member.dal.dataobject.address.MemberAddressDO;
import cn.iocoder.yudao.module.member.service.address.AddressService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import javax.annotation.Resource;
import javax.validation.Valid;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.operatelog.core.enums.OperateTypeEnum.CREATE;

@Tag(name = "管理后台 - 会员收货地址")
@RestController
@RequestMapping("/admin-api/member/address")
@Validated
public class AddressController {

    @Resource
    private AddressService addressService;

    @PostMapping("/create")
    @Operation(summary = "创建收货地址")
    @PreAuthorize("@ss.hasPermission('member:address:create')")
    @OperateLog(type = CREATE)
    public CommonResult<Long> createAddress(@Valid @RequestBody AddressCreateReqVO createReqVO) {
        return success(addressService.createAddress(createReqVO));
    }

    @GetMapping("/page")
    @Operation(summary = "获得收货地址分页")
    @PreAuthorize("@ss.hasPermission('member:address:query')")
    public CommonResult<PageResult<AddressRespVO>> getAddressPage(@Valid AddressPageReqVO pageVO) {
        PageResult<MemberAddressDO> pageResult = addressService.getAddressPage(pageVO);
        return success(AddressConvert.INSTANCE.convertPage(pageResult));
    }
}
```

---

## §3 深入源码：四大高阶框架机制与避坑指南 (Gotchas)

### 1. 多租户底层隔离机制 (`TenantLineInnerInterceptor`)
- **工作机制**：Yudao 基于 MyBatis-Plus 的 `TenantLineInnerInterceptor`，在执行 SQL 解析阶段通过 JSqlParser 自动给所有继承了 `TenantBaseDO` 的数据表追加 `WHERE tenant_id = ?` 条件；
- **坑点 1：定时任务中无租户上下文**：
  在 XXL-Job 或异步线程 (`@Async`) 中，`TenantContextHolder.getTenantId()` 为 `null`，会导致查询漏掉租户条件或报租户缺失错误。
  **正确解法**：在异步任务最外层使用 `TenantUtils.execute(tenantId, () -> { ... })` 显式包裹执行上下文！
- **坑点 2：平台全局公共字典表被强加租户过滤**：
  若是全局公共表（如全国行政区划、全局默认套餐），实体类绝不能继承 `TenantBaseDO`，而应继承 `BaseDO`；如果临时需要跨租户查业务表，必须在 Service 方法上标记 `@TenantIgnore`。

### 2. 行级数据权限体系 (`@DataPermission`)
- **工作机制**：Yudao 支持基于部门和角色的行级权限过滤（全部数据、本部门数据、仅本人数据等）；
- **生效条件**：Mapper 查询方法默认自动受数据权限拦截，若某个统计或内部校验无需受当前登录人部门权限约束，必须在方法上显式加设 `@DataPermission(enable = false)`。

### 3. 分布式锁与防重复提交 (`@Idempotent` & Redisson)
- 在支付回调、扣减库存、订单提交等关键接口上，必须施加幂等守卫：
```java
// 锁 key 拼接 userId 和业务标识，锁定 10 秒
@Idempotent(timeout = 10, timeUnit = TimeUnit.SECONDS, keyResolver = DefaultIdempotentKeyResolver.class, message = "操作过于频繁，请稍候再试")
```

### 4. MapStruct 编译期映射常见错误
- **报错**：`Can't map property ... to ...`；
- **根因**：Lombok 的 `@Data` 生成的 getter/setter 在某些 JDK/Maven 插件顺序下后于 MapStruct 执行；
- **正确姿势**：在 `pom.xml` 中严格保证 `lombok` 依赖在 `mapstruct-processor` 之前，并显式配置 `lombok-mapstruct-binding`！

---

## §4 验证与验收自查清单 (Definition of Done)

数字员工完成接口开发后，必须完成以下自检方可进入下游契约同步：
1. **编译检查**：在 `apps/backend` 目录下执行 `mvn compile -DskipTests`，确认无 MapStruct 与 Lombok 编译报错；
2. **Swagger 校验**：启动后端后，访问 `http://localhost:48080/doc.html`，确认新增接口已在 Knife4j 正常渲染，且入参/出参 Schema 注释完整；
3. **契约直出**：执行 `bash packages/api-client/scripts/gen-api-sdk.sh`，确保强类型 TS SDK 成功更新且三端 `typecheck` 0 报错。
