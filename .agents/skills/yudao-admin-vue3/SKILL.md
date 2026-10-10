---
name: yudao-admin-vue3
description: Yudao-UI-Admin-Vue3 前端运营管理中台深度研发指南。深入剖析 Vue 3 + Vite + Element Plus + Pinia 架构，指导数字员工熟练运用 useCrudSchemas 统一表单/表格元数据、useTable 分页查询编排、useMessage 统一弹窗反馈、DICT 数据字典状态标签、v-hasPermi 细粒度按钮鉴权以及极简两字交互规范。
---

# Yudao-UI-Admin-Vue3 运营后台深度研发法典

> **最高法典契约**：PC 管理端是企业运营与掌柜指挥的大脑。界面必须遵循**高信噪比、极简两字按钮、零死穴交互**原则。严禁在每个表单和表格重复编写冗余的 HTML 模板，必须采用官方核心的 `useCrudSchemas` 元数据驱动引擎，所有写操作必须加设二次确认与防重复提交，所有敏感操作必须绑定 `v-hasPermi` 权限指令。

---

## §0 ⚡ AI 数字员工 Token 极限节约通道 (LLM Token-Saving Fast Track)

在进行 Vue 3 PC 管理端页面研发或重构时，严禁 AI Agent 盲目手写几百行包含 `<el-table>`、`<el-form>`、`<el-dialog>` 的死模板：

1. **一键生成标准 Vue3 视图与 TS API Client**:
   ```bash
   pnpm gen:module \
     --module <module-name> \
     --entity <EntityName> \
     --title "<业务标题>" \
     --fields "<name>:<type>:<comment>:<flags>,..."
   ```
   *产物*: 自动在 `apps/admin/src/views/<module>/<entity-kebab>/index.vue` 生成完整 Element Plus CRUD 页面，并在 `apps/admin/src/api/<module>/<entity-kebab>/index.ts` 生成强类型请求函数，节约上千行手写模板的 Token 消耗。

2. **路由与契约零漂移核验**:
   ```bash
   pnpm check:drift
   ```
   *在修改前端 API 或调用路径后，0.1 秒确认前端所有 API 与 Spring Boot 后端 Controller 路由 100% 对应无误。*

---

## §1 核心源码架构与 Hooks 设计哲学

官方 `yudao-ui-admin-vue3` 的设计灵魂是**“元数据驱动 (Schema-Driven CRUD)”**与**“高复用 Hooks 编排”**：

```
                    【Yudao Vue3 Admin 核心编排体系】

                        CRUD 业务页面 (index.vue)
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ useCrudSchemas   │      │ useTable         │      │ useMessage       │
│ 单一元数据定义:  │      │ 分页/排序/搜索:  │      │ 交互反馈:        │
│ • 表格列配置     │      │ • loading 状态   │      │ • 统一二次确认框 │
│ • 搜索表单字段   │      │ • pageNo/pageSize│      │ • 成功/错误 Toast│
│ • 新增/修改表单  │      │ • 自动请求与重置 │      │ • 导出加载遮罩   │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## §2 真实可运行完整业务 CRUD 页面范本 (以收货地址为例)

以下代码是一套完全对齐官方标准的生产级页面，包含表格、搜索、分页、新增修改抽屉与字典标签：

### 1. 接口定义 (`src/api/member/address/index.ts`)
```typescript
import request from '@/config/axios';

export interface AddressVO {
  id?: number;
  userId: number;
  name: string;
  mobile: string;
  areaId: number;
  detailAddress: string;
  defaultStatus: boolean;
  createTime?: string;
}

export const AddressApi = {
  // 查询地址分页列表
  getAddressPage: (params: any) => {
    return request.get({ url: '/admin-api/member/address/page', params });
  },

  // 获得地址详情
  getAddress: (id: number) => {
    return request.get({ url: `/admin-api/member/address/get?id=${id}` });
  },

  // 新增地址
  createAddress: (data: AddressVO) => {
    return request.post({ url: '/admin-api/member/address/create', data });
  },

  // 修改地址
  updateAddress: (data: AddressVO) => {
    return request.put({ url: '/admin-api/member/address/update', data });
  },

  // 删除地址
  deleteAddress: (id: number) => {
    return request.delete({ url: `/admin-api/member/address/delete?id=${id}` });
  }
};
```

### 2. 列表视图主页面 (`src/views/member/address/index.vue`)
```vue
<template>
  <doc-alert title="会员收货地址管理" url="https://cloud.iocoder.cn" />

  <!-- 1. 顶部搜索区 -->
  <ContentWrap>
    <el-form
      class="-mb-15px"
      :model="queryParams"
      ref="queryFormRef"
      :inline="true"
      label-width="68px"
    >
      <el-form-item label="收件姓名" prop="name">
        <el-input
          v-model="queryParams.name"
          placeholder="请输入收件姓名"
          clearable
          @keyup.enter="handleQuery"
          class="!w-240px"
        />
      </el-form-item>
      <el-form-item label="手机号码" prop="mobile">
        <el-input
          v-model="queryParams.mobile"
          placeholder="请输入手机号码"
          clearable
          @keyup.enter="handleQuery"
          class="!w-240px"
        />
      </el-form-item>
      <el-form-item>
        <el-button @click="handleQuery"><Icon icon="ep:search" class="mr-5px" /> 查询</el-button>
        <el-button @click="resetQuery"><Icon icon="ep:refresh" class="mr-5px" /> 重置</el-button>
        <el-button
          type="primary"
          plain
          @click="openForm('create')"
          v-hasPermi="['member:address:create']"
        >
          <Icon icon="ep:plus" class="mr-5px" /> 新增
        </el-button>
      </el-form-item>
    </el-form>
  </ContentWrap>

  <!-- 2. 数据表格区 -->
  <ContentWrap>
    <el-table v-loading="loading" :data="list" :stripe="true" :show-overflow-tooltip="true">
      <el-table-column label="地址编号" align="center" prop="id" width="100" />
      <el-table-column label="用户编号" align="center" prop="userId" width="120" />
      <el-table-column label="收件人" align="center" prop="name" width="120" />
      <el-table-column label="手机号" align="center" prop="mobile" width="130" />
      <el-table-column label="详细地址" align="center" prop="detailAddress" min-width="200" />
      <el-table-column label="默认状态" align="center" prop="defaultStatus" width="100">
        <template #default="scope">
          <el-tag :type="scope.row.defaultStatus ? 'success' : 'info'">
            {{ scope.row.defaultStatus ? '默认' : '普通' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="创建时间"
        align="center"
        prop="createTime"
        :formatter="dateFormatter"
        width="180"
      />
      <el-table-column label="操作" align="center" width="140" fixed="right">
        <template #default="scope">
          <el-button
            link
            type="primary"
            @click="openForm('update', scope.row.id)"
            v-hasPermi="['member:address:update']"
          >
            修改
          </el-button>
          <el-button
            link
            type="danger"
            @click="handleDelete(scope.row.id)"
            v-hasPermi="['member:address:delete']"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <Pagination
      :total="total"
      v-model:page="queryParams.pageNo"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
  </ContentWrap>

  <!-- 3. 表单弹窗 -->
  <AddressForm ref="formRef" @success="getList" />
</template>

<script setup lang="ts">
import { dateFormatter } from '@/utils/formatTime';
import { AddressApi, AddressVO } from '@/api/member/address';
import AddressForm from './AddressForm.vue';

defineOptions({ name: 'MemberAddress' });

const message = useMessage(); // 统一消息弹窗 Hook
const { t } = useI18n();

const loading = ref(true);
const list = ref<AddressVO[]>([]);
const total = ref(0);
const queryParams = reactive({
  pageNo: 1,
  pageSize: 10,
  name: undefined,
  mobile: undefined
});
const queryFormRef = ref();
const formRef = ref();

/** 查询列表 */
const getList = async () => {
  loading.value = true;
  try {
    const data = await AddressApi.getAddressPage(queryParams);
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
};

/** 搜索按钮操作 */
const handleQuery = () => {
  queryParams.pageNo = 1;
  getList();
};

/** 重置按钮操作 */
const resetQuery = () => {
  queryFormRef.value.resetFields();
  handleQuery();
};

/** 添加/修改操作 */
const openForm = (type: string, id?: number) => {
  formRef.value.open(type, id);
};

/** 删除按钮操作 */
const handleDelete = async (id: number) => {
  try {
    // 二次确认框
    await message.delConfirm();
    // 发起删除
    await AddressApi.deleteAddress(id);
    message.success(t('common.delSuccess'));
    // 刷新列表
    await getList();
  } catch {}
};

/** 初始化 */
onMounted(() => {
  getList();
});
</script>
```

### 3. 表单弹窗组件 (`AddressForm.vue`)
```vue
<template>
  <Dialog :title="dialogTitle" v-model="dialogVisible">
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="100px"
      v-loading="formLoading"
    >
      <el-form-item label="用户编号" prop="userId">
        <el-input-number v-model="formData.userId" placeholder="请输入用户编号" class="!w-full" />
      </el-form-item>
      <el-form-item label="收件人" prop="name">
        <el-input v-model="formData.name" placeholder="请输入收件人姓名" />
      </el-form-item>
      <el-form-item label="手机号码" prop="mobile">
        <el-input v-model="formData.mobile" placeholder="请输入手机号码" maxlength="11" />
      </el-form-item>
      <el-form-item label="详细地址" prop="detailAddress">
        <el-input v-model="formData.detailAddress" type="textarea" placeholder="请输入街道门牌地址" />
      </el-form-item>
      <el-form-item label="默认状态" prop="defaultStatus">
        <el-switch v-model="formData.defaultStatus" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取 消</el-button>
      <el-button :disabled="formLoading" type="primary" @click="submitForm">确 定</el-button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { AddressApi, AddressVO } from '@/api/member/address';

defineOptions({ name: 'AddressForm' });

const { t } = useI18n();
const message = useMessage();

const dialogVisible = ref(false);
const dialogTitle = ref('');
const formLoading = ref(false);
const formType = ref('');
const formData = ref<AddressVO>({
  id: undefined,
  userId: undefined as any,
  name: '',
  mobile: '',
  areaId: 0,
  detailAddress: '',
  defaultStatus: false
});
const formRules = reactive({
  userId: [{ required: true, message: '用户编号不能为空', trigger: 'blur' }],
  name: [{ required: true, message: '收件姓名不能为空', trigger: 'blur' }],
  mobile: [{ required: true, message: '手机号码不能为空', trigger: 'blur' }],
  detailAddress: [{ required: true, message: '详细地址不能为空', trigger: 'blur' }]
});
const formRef = ref();

/** 打开弹窗 */
const open = async (type: string, id?: number) => {
  dialogVisible.value = true;
  dialogTitle.value = type === 'create' ? '新增收货地址' : '修改收货地址';
  formType.value = type;
  resetForm();
  if (id) {
    formLoading.value = true;
    try {
      formData.value = await AddressApi.getAddress(id);
    } finally {
      formLoading.value = false;
    }
  }
};
defineExpose({ open });

/** 提交表单 */
const emit = defineEmits(['success']);
const submitForm = async () => {
  // 校验表单
  await formRef.value.validate();
  formLoading.value = true;
  try {
    const data = formData.value as unknown as AddressVO;
    if (formType.value === 'create') {
      await AddressApi.createAddress(data);
      message.success(t('common.createSuccess'));
    } else {
      await AddressApi.updateAddress(data);
      message.success(t('common.updateSuccess'));
    }
    dialogVisible.value = false;
    emit('success');
  } finally {
    formLoading.value = false;
  }
};

/** 重置表单 */
const resetForm = () => {
  formData.value = {
    id: undefined,
    userId: undefined as any,
    name: '',
    mobile: '',
    areaId: 0,
    detailAddress: '',
    defaultStatus: false
  };
  formRef.value?.resetFields();
};
</script>
```

---

## §3 深入源码：四大高阶组件与交互避坑指南 (Gotchas)

### 1. 数据字典组件规范 (`DictTag` 与 `DictSelect`)
- **展示态**：表格中枚举值绝不能手写 `v-if/else` 拼接，统一使用官方 `<dict-tag :type="DICT_TYPE.COMMON_STATUS" :value="scope.row.status" />`；
- **下拉态**：表单与搜索栏使用 `<dict-select v-model="..." :type="DICT_TYPE.COMMON_STATUS" />`；
- **坑点**：字典类型常数必须集中在 `@/utils/dict` 中声明，禁止在 Vue 文件中散落魔法数字字符串（如 `"sys_user_sex"`）。

### 2. Vite 跨域代理与 Token 传递细节
- **前端配置**：`vite.config.ts` 中的 `proxy` 默认将 `/admin-api` 代理到 `http://localhost:48080`；
- **请求头拦截器**：`src/config/axios/index.ts` 会自动在每个请求头带上：
  - `Authorization: Bearer <token>`
  - `tenant-id: <tenantId>`
- **坑点**：如果页面调用报 401，先检查本地 Storage 中的 `ACCESS_TOKEN` 是否过期。框架内置了通过 `REFRESH_TOKEN` 自动无感刷新的逻辑。

### 3. 极简两字 UI 与交互防抖硬规约
1. **两字按钮收敛**：所有操作按钮必须为标准的两个字（【查询】【重置】【新增】【修改】【删除】【导出】【导入】【启用】【停用】）；
2. **防重复提交**：保存按钮必须绑定 `:disabled="formLoading"`，防止网络微卡时连续点击产生重复记录；
3. **删除防手抖**：删除操作必须调用 `message.delConfirm()`，严禁不经确认直接发起 DELETE 请求。
