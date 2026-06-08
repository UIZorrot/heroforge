# Hero Forge 前端设计基线

记录日期：2026-05-13

本文档记录当前前端主要应用页面的视觉风格与界面约定，用作后续总体性重构前的设计基线。范围以 `frontend/src/App.tsx` 中 dashboard 内的非 landing 页面为主，包括 `FORGE`、`VAULT`、`TRAIN / ARENA`、`DUEL / Ranked PvP`、`RANKED`、`CHRONICLE`，并参考共享组件 `HeroCard`、`Forge`、`Effects`、`PvpArena`、`LadderPanel`、`DailyActivity`、`BattleVisualizer`。

Landing page 是独立营销入口，不作为本基线的主参照。

## 总体气质

当前主应用是一个深色、克制、仪式化的卡牌战斗控制台。它不是明亮的 SaaS 后台，也不是普通游戏大厅，而是偏“黑曜石档案库 + 英雄锻造台 + 竞技场终端”的混合风格。

核心感受：

- 深黑背景、低亮度面板、细线边框，整体对比强但不刺眼。
- 金色是唯一主强调色，用于选中、重要数值、行动按钮、稀有度和扫描线。
- 大量小字号、大字距、全大写标签，营造档案、仪式、终端读数的感觉。
- 卡牌图像是主要视觉资产，界面本身保持框架化和控制台化。
- 交互动效轻微，偏淡入、位移、细线扫描、发光脉冲，而不是夸张弹跳。

## 应用布局

Dashboard 使用固定左侧导航 + 主内容滚动区。

- 左侧导航固定在视口左侧，高度为 `100vh`，有收起和展开两种宽度：约 `92px` 与 `232px`。
- 收起状态只显示 logo 图标和图标按钮；展开状态显示 `CONSOLE`、Hero Forge 标识、导航文本和序号。
- 主内容区随侧边栏宽度改变 `margin-left`，自身是 `h-screen` 内部滚动。
- 主内容最大宽度约 `1600px`，四周留出较大的 `px-10 py-10`。
- 顶部有统一 overview 区块：左侧显示当前模块大标题，右侧显示一句引语、当前中文模块名和卡牌数量。
- 主体区域通常是两列：左侧 `280px` 信息栏，右侧为主要功能面板。
- 右侧主面板有统一黑色半透明底、细边框和顶部金色扫描线。

主内容不是 page-by-page 完全独立布局，而是所有功能页共享同一个“控制台框架”，仅替换右侧内容。

## 色彩

基础色：

- 页面底色：`#080808`。
- 面板深黑：`#090909`、`#0a0a0a`、`#0f0f0f`、`bg-black/25` 到 `bg-black/60`。
- 边框：以 `stone-800`、`stone-800/70`、`white/10` 为主。
- 主文字：`stone-100`、`stone-200`。
- 次级文字：`stone-400`、`stone-500`。
- 弱提示或空状态：`stone-600`、`stone-700`。

强调色：

- 主金色：`gold-matte #b49664`，以及代码中常见的 `#c59a5a`。
- 高亮金色文字：`#f0d8ad`。
- 金色通常以低透明度使用：`gold-matte/5`、`/10`、`/20`、`/30`、`/50`、`/70`。

辅助状态色：

- 稀有度：mythic 金色、epic 紫色、rare 蓝色、common 灰色。
- 正向或治疗：emerald。
- 警告或等待：amber。
- 失败、死亡、取消：red 或 rose。
- 战斗效果：sky、cyan、violet、orange 等只作为局部效果色，不能压过黑金主基调。

## 字体与排版

字体栈：

- 标题：`Cormorant Garamond`。
- Logo：`Cinzel`。
- 正文：`Manrope`。
- 数字和部分数据：`IBM Plex Mono`。

排版习惯：

- 页面大标题常用 `text-5xl` 到 `text-6xl`，轻字重，超大字距。
- 模块标题常写成分隔字母形式，例如 `F O R G E`、`V A U L T`、`A R E N A`。
- 小标签大量使用 `text-[10px]`、`text-xs`、uppercase、`tracking-[0.2em]` 到 `tracking-[0.35em]`。
- 正文说明多为 `text-sm`，行高 `leading-6` 或 `leading-7`，颜色为 `stone-400`。
- 字重普遍较轻：`font-light` 是主要气质。
- 标题和标签之间常配合细横线、菱形点、分隔线使用。

## 表面与装饰

当前界面主要使用矩形、细边框和透明黑面板。

- 大多数面板没有圆角，卡牌、弹窗、输入框和按钮也以直角为主。
- 主表面常见样式：`border border-stone-800 bg-black/30 p-4/p-6 backdrop-blur-md`。
- 关键容器会有顶部金色渐变线或横向扫描线。
- 分隔符包括 `0.5px` 细线、短横线、旋转 45 度的小菱形。
- 背景有非常低透明度的径向光晕和模糊色块，颜色以金色、紫色、暗绿色为辅。
- 滚动条极细，黑底金色低透明 thumb。
- 选中态用金色边框、金色底透明层、细 ring 或轻微 glow 表达。

## 交互与动效

动效主要由 `framer-motion` 和少量 CSS animation 实现。

- 页面和面板切换：淡入、轻微上下位移，约 `0.35s` 到 `0.45s`。
- 侧边栏展开：宽度动画，缓动 `[0.22, 1, 0.36, 1]`。
- 导航 hover：轻微横向位移或颜色变亮。
- 卡牌 hover：向上浮动 `-translate-y-1` 到 `-translate-y-2`，图片轻微放大。
- 加载态：旋转图标、圆环、淡入。
- 装饰线：顶部金色扫描线循环移动。
- 背景光晕：低透明度循环脉冲。

动效服务于“终端启动、档案切换、竞技场激活”的感觉，应保持克制。

## 共享组件风格

### HeroCard

HeroCard 是当前最重要的视觉组件。

- 整体为直角卡牌，深黑底，边框颜色由稀有度决定。
- 图像区域约占上方 `58%`，信息区域约占下方 `42%`。
- 图像顶部显示稀有度、职业类型、状态标签；右上角显示 BP。
- 底部包含名称、两行描述、四个 stat pill、技能摘要和 infusion 标签。
- 选中态使用金色边框和 ring；禁用态使用透明度降低与灰度。
- 无图时使用首字母、职业标签和暗金径向背景作为占位。

### Effects 组件

`SectionHeader`、`StatPill`、`StatusPill`、`MetricCard`、`EmptyState` 是当前事实上的轻量 UI 基础组件。

- SectionHeader 使用小号 eyebrow、大标题和说明文字。
- StatPill / StatusPill 是细边框 chip，按 tone 映射 gold、violet、emerald、slate、amber。
- MetricCard 是小型数据卡：小标签、大数字、可选 hint。
- EmptyState 使用虚线边框、黑底和居中文字。

### Forge 上传区

Forge 页面是仪式化上传流程。

- 页面标题居中，下面是短引语和金色分隔线。
- 上传区是大矩形 drop zone，黑底、细边框、hover 边框变亮。
- forging 状态使用金色圆环、旋转动画和 `Sparkles` 图标。
- preview 状态图像全宽展示，底部黑色渐变压字。
- 材料选择是可折叠列表，选中态为金色边框和金色低透明背景。

### Vault 档案库

Vault 是卡牌浏览和详情查看页。

- 顶部居中大标题、引语、三组统计值。
- 搜索框是无外框的下划线输入。
- rarity 和 sort 控件是文本式 tab，选中态为金色文字加下边框。
- 卡牌网格目前是三列，大间距，卡牌 hover 上浮。
- 卡牌详情使用全屏黑色遮罩弹窗，左侧大卡牌，右侧为属性、技能、描述和操作按钮。

### Train / Arena 练习场

Train 页面是对称的战斗舞台。

- 标题居中，上下用短线和菱形构成仪式分隔。
- 1v1 / 3v3 使用文本 tab 控制。
- 左右两侧放置英雄卡槽，中间是垂直线、`VS` 和主行动按钮。
- 空卡槽为虚线边框和加号图标。
- 胜负态通过赢家金色边框、输家灰度和透明度降低表达。
- 底部 battle log 是黑底控制台，带行号和 `SYSTEM` 风格空状态。

### Ranked PvP / Duel

PvpArena 更偏操作型控制台。

- 顶部使用 SectionHeader 和状态 pill。
- 主体为 roster 选择、2x3 formation、match control 和 lobby state 的密集布局。
- 使用大量 metric card、stat pill、状态说明和小型表格卡片。
- 行动按钮按语义区分：Find match 金色，Cancel queue 玫红，Revive 绿色。
- 战斗结果复用 BattleVisualizer，保持黑底细框、chip、battle feed。

### Ranked / Ladder

LadderPanel 是排行档案页。

- 顶部大面板显示 tier、说明、rating、win rate。
- 下方四个统计卡显示 Played、Wins、Losses、Ties。
- 主体为 recent matches 列表和 MVP Rules 规则栏。
- 结果标签用 win/loss/tie 语义色，但整体仍是黑底、石色边框、金色数值。

### Chronicle

Chronicle 当前是占位页。

- 居中小面板，黑底、细框、金色标题。
- 用较少内容表达未开放功能，按钮为不可用态。
- 这是当前最轻量的页面，应在后续扩展时继承主控制台基调。

## 图标

图标来自 `lucide-react`。

- 导航：Gem、Search、Swords、Trophy、Shield 等，尺寸通常 `14px`。
- 操作：Plus、X、Chevron、RefreshCw、Send、Sparkles、Trash2、Zap 等。
- 图标颜色多为 `stone-500`，active 或重点操作切换为金色。
- 关闭、删除、展开等控件偏方形图标按钮，仍使用直角边框。

## 文案风格

界面文案混合英文控制台词汇和少量中文模块名。

- 主导航和按钮多用英文大写：`FORGE`、`VAULT`、`TRAIN`、`DUEL`、`RANKED`、`ENGAGE`、`REMATCH`。
- 辅助短语偏世界观表达，例如 `"Illuminate the enemy"`、`"Archive of legends"`。
- 操作说明偏功能化，短句为主。
- 小标签倾向终端/档案语气：`OVERVIEW`、`CARDS`、`Material Vault`、`System Log`、`Lobby state`。

后续如统一语言，需要注意不要丢失当前“档案终端 + 英雄竞技场”的语气。

## 保留价值

重构时建议优先保留这些识别度：

- 黑金、低亮度、细线框架的核心视觉资产。
- HeroCard 的卡牌比例、稀有度标记、BP 读数和 stat pill。
- 左侧控制台导航 + overview + 主功能面板的应用框架。
- 全大写小标签、轻字重、大字距标题。
- 细线、菱形点、扫描线、低透明 glow 这些仪式化装饰。
- 功能页“卡牌收集、锻造、训练、排位”的游戏化控制台逻辑。

## 当前设计风险

这些不是重构要求，只是记录当前基线中的弱点，后续修改时可以参考：

- 主色过度依赖黑、石色、金色，局部页面容易显得单调。
- `App.tsx` 中承担了过多页面结构，设计规则和业务状态混在一起。
- 某些页面固定尺寸较多，例如卡牌和战斗区，对小屏适配风险较高。
- 中英文文案和部分代码内中文字符串存在不一致，需要后续单独清理。
- 组件层已有 `Effects` 基础组件，但大量按钮、面板、输入、tab 仍是散落的 Tailwind class。
