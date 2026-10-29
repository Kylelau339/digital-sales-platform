# Fixtures

本项目不包含任何第三方受版权保护的演示素材，所有测试数据均为代码动态生成。

本目录仅保留本说明文件。开发和测试 mock 数据位于 `apps/web/src/lib/api/mock-fixture.ts`；模板、授权、审核队列、扫描结果和占位预览均由代码生成。Vite fixture middleware 按请求生成纯色 SVG 占位图，不读取或分发外部图片文件。

`USE_FIXTURES=true` 仅用于本地开发和测试，生产环境禁止启用。