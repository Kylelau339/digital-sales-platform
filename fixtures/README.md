# Fixtures

本项目不包含任何第三方受版权保护的演示素材，所有测试数据均为代码动态生成。

`USE_FIXTURES=true` 仅启用本地开发用的 mock 数据；模板、授权、审核队列、扫描结果和预览图均由 `apps/web/src/lib/api/mock-fixture.ts` 生成。预览图由 Vite 开发服务器按请求生成纯色 SVG 占位图，不读取或分发外部图片文件。

生产环境禁止启用 fixtures。真实 API、上传包和私有交付文件使用本地私有存储配置，并不属于仓库内容。
