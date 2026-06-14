# 模块模板（AI 复制此目录创建新 Module）

复制步骤：

1. 复制 `_template/` 为 `modules/your-feature/`
2. 全局替换 `Template` → `YourFeature`，`template` → `your-feature`
3. 在 `app.module.ts` 或父 Module 的 `imports` 注册
4. 补充 `error-codes.ts`（如有新错误码）
5. 补充前端 `api/` 与路由（如有页面）

文件清单：

- `template.module.ts`
- `template.controller.ts`
- `template.service.ts`
- `dto/create-template.dto.ts`
- `dto/template-response.dto.ts`
