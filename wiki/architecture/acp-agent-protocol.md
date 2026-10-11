# 架构支柱：ACP 标准调度协议栈与免交互自主授权

- **Agent Client Protocol (ACP)**：通过标准 ACP 协议统一管理 6 大工具适配器；
- **免交互自主授权**：
  - cmd 工具配置 `--yolo --tools-all`；
  - claude 工具配置 `--dangerously-skip-permissions`；
  - 执行管道重定向 `< /dev/null` 防 stdin 挂起死锁。
