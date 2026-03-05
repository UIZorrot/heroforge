# Frontend 总体框架与组件设计

## 1. 页面目标与信息结构

- 目标：构建“锻造 → 入库 → 对战”的单页闭环，风格统一为低饱和、哑光金属、细边框。
- 核心页面分区：
  - Forge：上传图片并生成英雄卡，支持材料注入。
  - Vault：检索与管理英雄卡，查看详情并投放到对战槽位。
  - Duel：1v1 / 3v3 选人、开战、战斗回放与日志。
  - Chronicle：预留占位页，用于后续 PVE/剧情扩展。

## 2. 布局框架（当前实施版）

- 全局采用两层结构：
  - 左侧固定边栏（Sidebar）：品牌标识、主导航、状态位。
  - 右侧主工作区（Workspace）：顶部情绪化标题区 + 下方功能网格区。
- 工作区网格：
  - 左列：信息侧栏（最近卡牌 + 材料库存）。
  - 中列：主交互区（按 activeSection 切换 Forge/Vault/Duel/Chronicle）。
  - 右列（仅 Forge）：材料注入控制与影响说明。
- 响应策略：
  - 大屏优先三列/双列。
  - 小屏自动折叠为单列流式布局。

## 3. 组件职责设计

- App.tsx
  - 维护全局状态：卡牌存档、材料库存、当前 section、对战态、筛选排序态。
  - 承担页面编排：Sidebar、信息侧栏、主内容区、Forge 右侧控制面板。
- HeroCard.tsx
  - 单一职责：卡牌视觉呈现。
  - 输入：character、image、infusions、isSelected、compact。
  - 输出：统一卡牌样式与基础交互反馈（hover/selected）。
- Forge.tsx
  - 单一职责：上传/拖拽入口与锻造加载态。
  - 与 App 通过 onImageSelect、isForging、error 联动。
- BattleVisualizer.tsx
  - 单一职责：对战过程回放（HP/MP、行动事件、速度控制、日志联动）。
  - 与 App 通过 battleEvents / battleHeroes / onClose 联动。

## 4. 视觉规范（落地约束）

- 基础材质：`bg-[#080808]` + 黑灰层级背景，避免高饱和大面积块。
- 边框系统：以 `border-stone-800`、`border-hairline` 为主，强调分区而非发光。
- 点缀色：统一 `gold-matte` 作为高亮主色，其他颜色仅作为材料类型微区分。
- 形状语言：减少大圆角与胶囊感，优先直角、细线、轻过渡。
- 动效策略：只保留必要反馈（hover、入场、战斗步骤推进），避免炫技型动画。

## 5. 状态与数据流

- 本地持久化
  - 卡牌：`hero_forge_saved_cards_v1`
  - 材料：`hero_forge_material_inventory_v1`
- 核心状态：
  - `savedHeroes`：全卡牌源数据。
  - `materials` / `forgeSpend`：库存与本次注入。
  - `activeSection`：页面路由态（单页切换）。
  - `duelAId` / `duelBId` / `duelAIds` / `duelBIds`：1v1 与 3v3 槽位状态。
  - `battleEvents` / `battleResult` / `showBattle`：战斗展示状态。

## 6. 组件间协作路径

- Forge 流程
  - Forge 上传图片 → App 调用 forgeHero → 生成 Hero → 入库 savedHeroes → 更新材料库存。
- Vault 流程
  - Vault 检索/排序/筛选 → HeroCard 列表呈现 → 弹层查看详情 → 一键投放 Duel。
- Duel 流程
  - 槽位选人 → 校验阵容可开战 → runTeamDuel → 输出 `logs + result + events` → BattleVisualizer 回放。

## 7. 后续演进建议

- 将 App 内 section 视图拆分为 `ForgeSection / VaultSection / DuelSection`，降低单文件复杂度。
- 将 Sidebar 与信息侧栏提取为可复用布局组件，统一页面骨架。
- 为视觉 token 建立集中配置（颜色/边框/间距/字距），减少类名漂移。
