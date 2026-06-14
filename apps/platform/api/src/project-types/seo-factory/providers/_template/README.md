# Provider 模板（AI 复制此目录创建新适配器）

1. 复制 `_template/` 为 `providers/your-vendor/`
2. 实现 `@wm/provider-interfaces` 中的对应 Interface
3. 在模块 `providers` 数组注册 + token 绑定

文件：

- `template.adapter.ts` — 实现接口
- `template.types.ts` — 请求/响应类型（可选）
