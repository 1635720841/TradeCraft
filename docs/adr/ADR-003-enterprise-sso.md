# ADR-003: Enterprise SSO 预留

- 状态：已采纳（预留阶段）
- 日期：2026-06-29

## 背景

企业客户采购常要求 SAML/OIDC 企业 IdP 与目录同步（SCIM）。当前平台通过 Logto 提供标准 OIDC 登录，尚未支持 per-org IdP 配置。

## 决策

1. **本轮不实现** SAML/SCIM UI 与同步逻辑
2. **预留扩展点**：
   - `Organization.ssoConfig Json?`（未来 migration）：`{ provider: 'logto-saml', idpMetadataUrl, domains[] }`
   - Logto Enterprise SAML 连接器作为首选 IdP 集成路径
3. **成员邀请** 与 Logto JIT 并存：邀请邮件 → accept → Logto 登录 → 加入已有 org

## 后果

- 短期无 Enterprise SSO 销售 blocker 时需 Console 手工建租户
- 后续 ADR 实施时需：Org Profile 管理端折叠区、domain verification、SCIM webhook
