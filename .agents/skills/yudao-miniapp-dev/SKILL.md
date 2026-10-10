---
name: yudao-miniapp-dev
description: Yudao-Mall-UniApp 微信小程序与移动端深度研发法典。指导数字员工遵循 Uni-App Vue 3 标准规范、微信静默授权登录 (wx.login)、双 Token 自动无感刷新机制、微信支付与退款流转闭环、分包加载 (subPackages) 规避 2MB 限制、以及 iPhone 底部安全区适配规范。
---

# Yudao-Mall-UniApp 微信小程序深度研发法典

> **最高法典契约**：小程序端是直接面向海量终端消费者与现场工人的移动阵地。必须做到**微信静默授权秒级登录、首屏渲染无感跳白、网络断网自愈重试、严格遵守 2MB 分包红线**。严禁在主包堆砌业务子页面，严禁明文暴露微信 AppSecret，严禁无防抖多次触发微信支付。

---

## §1 核心目录结构与分包治理方案 (打破 2MB 限制)

微信小程序主包代码量必须控制在 **2MB 以内**，工程必须严格执行分包隔离：

```
apps/miniapp/src/
├── pages/                    # 【主包核心页面】(仅保留 TabBar 页面与极简路由，体积必须 < 1MB)
│   ├── index/index.vue       # 商城首页 / 工作台
│   ├── category/index.vue    # 分类导航
│   ├── cart/index.vue        # 购物车
│   └── user/index.vue        # 个人中心
├── pages-sub/                # 【业务分包目录】(按业务域拆解)
│   ├── order/                # 订单分包: 确认下单、收银台、订单列表、物流详情
│   ├── member/               # 会员分包: 收货地址、个人信息、优惠券、积分中心
│   └── pay/                  # 支付分包: 支付结果、对账凭证
├── components/               # 跨端通用轻量组件 (必须配置 easycom 自动按需引入)
├── store/                    # Pinia 状态树 (user.ts 用户态, cart.ts 购物车, app.ts 主题)
├── utils/                    # 移动端工具箱
│   ├── http.ts               # 基于 uni.request 的核心网络库 (401 自动挂起重试)
│   └── auth.ts               # 本地存储 (uni.setStorageSync) 与 Token 续期
├── static/                   # 纯静态资源 (小图标走 SVG/Iconfont，大图必须放 CDN)
├── pages.json                # 页面路由与分包配置文件
└── manifest.json             # 微信 AppID 与原生权限配置
```

### `pages.json` 分包配置范式
```json
{
  "pages": [
    { "path": "pages/index/index", "style": { "navigationBarTitleText": "首页" } },
    { "path": "pages/user/index", "style": { "navigationBarTitleText": "我的" } }
  ],
  "subPackages": [
    {
      "root": "pages-sub/member",
      "pages": [
        { "path": "address/list", "style": { "navigationBarTitleText": "收货地址" } },
        { "path": "address/edit", "style": { "navigationBarTitleText": "编辑地址" } }
      ]
    },
    {
      "root": "pages-sub/order",
      "pages": [
        { "path": "confirm", "style": { "navigationBarTitleText": "确认订单" } },
        { "path": "detail", "style": { "navigationBarTitleText": "订单详情" } }
      ]
    }
  ],
  "preloadRule": {
    "pages/index/index": {
      "network": "all",
      "packages": ["pages-sub/order", "pages-sub/member"]
    }
  }
}
```

---

## §2 真实可运行完整业务页面 (以收货地址管理为例)

### 1. 列表页面 (`pages-sub/member/address/list.vue`)
```vue
<template>
  <view class="address-container">
    <!-- 1. 地址列表 -->
    <view v-if="addressList.length > 0" class="address-list">
      <view
        v-for="item in addressList"
        :key="item.id"
        class="address-card"
        @tap="handleSelectAddress(item)"
      >
        <view class="card-header">
          <text class="user-name">{{ item.name }}</text>
          <text class="user-mobile">{{ item.mobile }}</text>
          <text v-if="item.defaultStatus" class="default-badge">默认</text>
        </view>
        <view class="card-detail">
          <text>{{ item.detailAddress }}</text>
        </view>
        <view class="card-footer">
          <view class="action-btn" @tap.stop="goToEdit(item.id)">
            <text class="edit-text">编辑</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 2. 空状态展示 -->
    <view v-else class="empty-state">
      <text class="empty-text">暂无收货地址，赶快添加一个吧</text>
    </view>

    <!-- 3. 底部固定新增按钮 (适配 iPhone 安全底栏) -->
    <view class="bottom-action-bar">
      <button class="primary-btn" @tap="goToAdd">添加收货地址</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { http } from '@/utils/http';

interface AddressItem {
  id: number;
  name: string;
  mobile: string;
  detailAddress: string;
  defaultStatus: boolean;
}

const addressList = ref<AddressItem[]>([]);

const loadAddressList = async () => {
  try {
    const res = await http.get('/app-api/member/address/list');
    addressList.value = res.data;
  } catch (err) {
    console.error('加载地址失败', err);
  }
};

const goToAdd = () => {
  uni.navigateTo({ url: '/pages-sub/member/address/edit' });
};

const goToEdit = (id: number) => {
  uni.navigateTo({ url: `/pages-sub/member/address/edit?id=${id}` });
};

const handleSelectAddress = (item: AddressItem) => {
  // 如果是从订单结算页选地址进入，通知上层并返回
  uni.$emit('SELECT_ADDRESS', item);
  uni.navigateBack();
};

onShow(() => {
  loadAddressList();
});
</script>

<style lang="scss" scoped>
.address-container {
  padding: 24rpx;
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  background-color: #f7f8fa;
}

.address-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;

  .card-header {
    display: flex;
    align-items: center;
    font-size: 32rpx;
    font-weight: 600;

    .user-mobile {
      margin-left: 20rpx;
      color: #666666;
    }

    .default-badge {
      margin-left: 20rpx;
      padding: 4rpx 12rpx;
      font-size: 20rpx;
      color: #ff4d4f;
      background: #fff1f0;
      border-radius: 8rpx;
    }
  }

  .card-detail {
    margin-top: 16rpx;
    font-size: 28rpx;
    color: #333333;
    line-height: 1.5;
  }

  .card-footer {
    margin-top: 20rpx;
    border-top: 1rpx solid #eeeeee;
    padding-top: 16rpx;
    display: flex;
    justify-content: flex-end;

    .edit-text {
      color: #1890ff;
      font-size: 26rpx;
    }
  }
}

.bottom-action-bar {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  background: #ffffff;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)) 32rpx;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.05);

  .primary-btn {
    background: #1890ff;
    color: #ffffff;
    border-radius: 44rpx;
    font-size: 32rpx;
    height: 88rpx;
    line-height: 88rpx;
  }
}
</style>
```

---

## §3 深入源码：微信生态高频暗坑指南 (Gotchas)

### 1. 页面栈深度溢出暗坑 (`navigateTo` vs `redirectTo`)
- **机制**：微信原生小程序严格限制页面跳转栈深度最多为 **10 层**；
- **坑点**：如果从列表跳详情、详情又跳列表，连续多次 `navigateTo` 达到 10 层后，页面跳转直接静默失败，点击无响应；
- **解决方案**：在支付完成跳订单详情、或者登录成功跳回首页时，必须使用 `uni.redirectTo` 或 `uni.reLaunch`，彻底清空已完结的历史页面栈！

### 2. 双 Token 自动静默无感续期
- **机制**：Yudao 的 `accessToken` 寿命较短（通常为 30 分钟），`refreshToken` 寿命为 30 天；
- **坑点**：当用户在小程序浏览时，Token 突然过期，若直接跳登录页强制重新登录，用户体验极差；
- **正确姿势**：在 `http.ts` 拦截器中，收到 401 响应时，先将后续请求排入挂起队列，在后台静默发起 `/app-api/member/auth/refresh-token?refreshToken=...`。新 Token 返回后，刷新本地缓存并自动重放挂起的失败请求，用户无感！

### 3. iPhone 底部安全区物理穿透
- **坑点**：底部固定悬浮条（如结账栏、操作栏）如果不适配 iPhone 的手势小白条（Home Indicator），按钮会被黑条遮挡导致点不到；
- **正确姿势**：所有 `position: fixed; bottom: 0` 的容器，`padding-bottom` 必须严格写为：
  ```css
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  ```
