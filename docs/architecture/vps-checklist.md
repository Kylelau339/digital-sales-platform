# Namecheap VPS 部署检查

## 系统与进程

- Ubuntu LTS，Node.js LTS，生产依赖在 VPS 上安装。
- `better-sqlite3` 和 `argon2` 在 VPS 上用原生工具链编译并运行验证：

```bash
node --version
npm ci
npm rebuild better-sqlite3 --build-from-source
node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); console.log(db.prepare('select sqlite_version() v').get())"
```

- 使用 systemd 或 PM2 常驻，崩溃自动重启，重启后自动拉起。
- Node 只监听 `127.0.0.1:3000`；Nginx 反代，公网只开 22/80/443。
- certbot HTTPS 自动续期，HTTP 重定向 HTTPS。
- 生产 `USE_FIXTURES=false`、`MOCK_USDT_ENABLED=false`；Session/CSRF secret 用独立随机值。

## SQLite 与文件

- SQLite 文件放 `/var/lib/<app>/data`，私有文件放 `/var/lib/<app>/private`，均在 Web 根目录外。
- 启动时确认 WAL、`synchronous=NORMAL`、`busy_timeout` 和外键开启。
- 所有写事务短；不在事务内调用 HTTP、支付、邮件或生成签名地址。
- 私有目录不由 Nginx alias 暴露；下载未来必须经授权检查。

## 备份恢复

在线数据库备份：

```bash
sqlite3 /var/lib/<app>/data/app.db ".backup '/var/backups/<app>/app-$(date +%Y%m%d-%H%M%S).db'"
rsync -a --delete /var/lib/<app>/private backup-host:/srv/<app>/private/
```

保留多个数据库和私有文件版本；执行 `PRAGMA integrity_check;`。至少完成一次完整恢复演练：恢复数据库和私有目录、校验 SHA-256、启动服务、查询订单并验证授权流程。

## 上线阻断项

如果常驻 Node 进程、SSH/自动重启、原生模块编译、持久化磁盘、目录权限或异机备份任一项不通过，停止在该 VPS 上部署交易服务；不要以 `sql.js` 替代 SQLite。先修复 VPS 环境或迁移到支持 Node 原生模块和持久化私有磁盘的宿主。
