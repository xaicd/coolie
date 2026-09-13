// Coolie (Paperclip fork) 本地常驻配置 — pm2
// 启动:  pm2 start ecosystem.config.cjs   （在仓库根目录执行）
// 日常:  pm2 restart coolie | pm2 logs coolie | pm2 status
module.exports = {
  apps: [
    {
      name: "coolie",
      cwd: "/Users/mac/workspace/xaicd/coolie/server",
      script: "./node_modules/.bin/tsx",
      args: "src/index.ts",
      // 注意：不能用 node dist/index.js —— workspace 包(@paperclipai/db 等)的
      // exports 指向 src/*.ts（仅 npm 发布时才指向 dist），纯 node 解析不了，
      // 必须经 tsx。仓库自身的 pnpm dev 也是 tsx。
      interpreter: "none",
      // 崩溃自动拉起
      autorestart: true,
      max_restarts: 20,
      min_uptime: "30s",
      restart_delay: 3000,
      // 日志滚动（pm2-logrotate 未装时先按时间切割内置支持）
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/tmp/coolie-server.err.log",
      out_file: "/tmp/coolie-server.out.log",
      merge_logs: true,
      env: {
        PORT: "3100",
        SERVE_UI: "true",
        PAPERCLIP_DEPLOYMENT_MODE: "authenticated",
        PAPERCLIP_DEPLOYMENT_EXPOSURE: "private",
        PAPERCLIP_BIND: "lan",
        PAPERCLIP_ALLOWED_HOSTNAMES:
          "192.168.3.85,192.168.3.86,macdeMac-Studio,macdeMac-Studio.local,100.84.124.71",
        // TODO: 换成 openssl rand -base64 32 生成的值（换了之后所有登录会话失效，需重新登录）
        BETTER_AUTH_SECRET: "dev-secret",
        PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: "dev-tool-secret",
      },
    },
  ],
};
