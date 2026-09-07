# 习惯打卡 Web App

一个按月记录每日作息习惯的响应式 Web App，支持电脑和手机访问、习惯矩阵编辑、习惯管理，以及总体/分类统计图表。

## 功能

- 月度习惯矩阵：分类、分项、目标、日期四段结构
- 习惯分三类：
  - 睡觉：早睡、早起，记录时间点
  - 实修：站桩、打坐，记录分钟数；持五戒使用勾选
  - 阅读：文史、哲思，记录分钟数
- 矩阵中的每日内容可直接编辑
- 右侧管理习惯面板支持新增、编辑、删除习惯
- 每日总体得分面积图
- 睡觉、实修、阅读三张独立图表
- 今日快捷打卡
- Weekly Plan 周计划页面：周历、任务、实际时间、完成状态和每日日记
- 月度总览、达标项、连续达标天数
- 周末日期使用独立颜色区分
- SQLite 本地持久化
- Docker Compose 部署

## 技术栈

- Next.js 16 + React 19 + TypeScript
- better-sqlite3 + SQLite
- ECharts
- Webpack 构建
- Docker / VPS 自托管

## 本地运行

```bash
npm install
npm run build
npm start
```

访问：

- 本机：http://localhost:3000
- 同一局域网手机：http://192.168.31.56:3000

首次启动会自动创建示例习惯并生成当前月份演示数据。页面可以直接修改，也可以点击右上角“清空本月”。

## 登录

页面和数据 API 都需要登录后才能访问。未登录访问首页会跳转到 `/login`，直接调用数据 API 会返回 `401`。

本地开发使用的账号密码和会话密钥放在 `.env.local`：

```text
HABIT_ADMIN_USERNAME=admin
HABIT_ADMIN_PASSWORD=...
HABIT_SESSION_SECRET=...
COOKIE_SECURE=false
```

`.env.local` 已加入 `.gitignore`，不会提交到 Git。登录成功后会设置 HttpOnly Cookie，登录态有效期 30 天。

Docker/VPS 部署前需要准备 `.env`，可以参考 `.env.example`：

```bash
cp .env.example .env
```

并至少修改：

```text
HABIT_ADMIN_PASSWORD
HABIT_SESSION_SECRET
```

如果以后启用 HTTPS，将 `COOKIE_SECURE` 改为 `true`。

开发模式：

```bash
npm run dev
```

部分 macOS 环境可能出现 `EMFILE` 文件监听警告；此时使用 `npm run build && npm start` 即可，不影响生产模式。

## Docker / VPS

```bash
docker compose up -d --build
```

应用监听 `3000` 端口。SQLite 数据保存在 Docker volume：

```text
habit-data -> /app/data/habits.db
```

容器默认使用 `Asia/Shanghai` 作为应用时区，月度页面的“今天”也按该时区计算。若要切换到其他时区，请在 `.env` 中同时设置：

```text
TZ=Asia/Shanghai
HABIT_TIME_ZONE=Asia/Shanghai
```

## 数据存储

SQLite 是嵌入式文件数据库，不单独启动服务。

本机开发数据库：

```text
data/habits.db
```

SQLite 伴随文件：

```text
data/habits.db-wal
data/habits.db-shm
```

旧版本迁移备份：

```text
data/habits.db.bak-v1
```

`data/` 已加入 `.gitignore`，数据库不会提交到 Git。

可以手动检查：

```bash
sqlite3 /Users/peng/project/codex/habit_web/data/habits.db

.tables
SELECT * FROM habits;
SELECT * FROM records LIMIT 10;
```

## 数据模型

### habits

```text
id          TEXT 主键
name        习惯名称
category    sleep / practice / reading
target      目标值；时间习惯为分钟数，如 1350 = 22:30
unit        boolean / minutes / times / time
color       图表颜色
sort_order  排序
created_at  创建时间
```

### records

```text
habit_id    习惯 ID
date        YYYY-MM-DD
value       实际值
              - minutes/times：分钟数或次数
              - time：从 00:00 起的分钟数
              - boolean：0 或 1
completed   0 / 1
note        备注
updated_at  更新时间
```

### meta

存储数据库迁移版本、演示数据标记等系统信息。

### weekly_tasks

```text
id           任务 ID
week_start   周一日期 YYYY-MM-DD
date         任务所属日期
title        任务名称
actual_time  实际完成时间
completed    0 / 1
created_at   创建时间
```

### weekly_diaries

```text
week_start   周一日期 YYYY-MM-DD
date         日记日期
content      日记内容
updated_at   更新时间
```

## 总体得分算法

单习惯每日得分先归一化到 `0–100`，然后计算每日平均分和整月综合分。

### 1. 单习惯当日得分

```text
如果当天无记录：
  score = 0

勾选习惯：
  score = 100（已完成）
  score = 0（未完成）

分钟 / 次数习惯：
  score = min(100, 实际值 / 目标值 × 100)

时间习惯（早睡、早起）：
  lateMinutes = 实际时间 - 目标时间

  早睡习惯的 00:00–06:00 记录视为次日。
  例如目标 21:00、实际 00:07：lateMinutes = 24*60 - 21*60 + 7 = 187

  如果 lateMinutes <= 0：
    score = 100

  否则：
    score = max(0, 100 - lateMinutes / tolerance × 99)

  tolerance：
    早睡 = 90 分钟
    早起 = 60 分钟

最终分数限制在 0–100。
```

例如：

- 站桩目标 30 分钟，实际 24 分钟：`24 / 30 × 100 = 80`
- 早睡目标 22:30，实际 23:00：晚 30 分钟，`100 - 30/90 × 99 ≈ 67`
- 早睡目标 22:30，实际 22:00：早 30 分钟，得分 `100`

### 2. 每日总体得分

```text
每日总体得分 =
  当天所有习惯 score 之和
  ÷ 当天习惯数量
```

持五戒等勾选习惯也会参与每日总体得分。

### 3. 整月综合得分

```text
综合得分 =
  所有习惯 × 所有日期的 score 总和
  ÷（习惯数量 × 当月天数）
```

其他月度指标：

```text
达标项 = 所有习惯当日 score >= 80 的次数之和

完整达标日 = 每日总体得分 = 100 的天数

活跃天数 = 每日总体得分 > 0 的天数

连续达标 =
  从昨天开始向前，每日总体得分 = 100 的连续天数
```

## 总体图表算法

### 每日总体得分图

- 横轴：日期 `1–31`，每天一个刻度
- 最后一个日期显示 `31日`
- 纵轴：`0–100`
- 数值：每日总体得分
- 图内 80 分参考线为绿色虚线

## 单项统计图表算法

### 1. 睡觉图

- 横轴：日期，每天一个刻度，最后一天显示 `31日`
- 纵轴：偏离目标的小时数
- 纵轴范围：`-1～3`
- 三条线：
  - Goal：`y=0` 虚线
  - 早睡：实际时间相对 `早睡目标` 的偏差
  - 早起：实际时间相对 `早起目标` 的偏差

偏离时长计算：

```text
早起：
  deviationMinutes = 实际时间 - 早起目标时间

早睡：
  如果实际时间 < 目标时间 且 实际时间 <= 06:00：
    视为跨天后晚睡
    deviationMinutes = 1440 - 早睡目标时间 + 实际时间
  否则：
    deviationMinutes = 实际时间 - 早睡目标时间

deviationHours = deviationMinutes / 60
deviationHours = clamp(deviationHours, -1, 3)
```

示例：

```text
早睡目标 22:30：
  23:30 -> +1h
  04:30 -> 跨天 +6h，最终按 +3h 显示
  22:00 -> -0.5h

早起目标 06:30：
  07:00 -> +0.5h
  06:00 -> -0.5h
  04:30 -> -2h，最终按 -1h 显示
```

数据线为普通折线，每个记录日显示实心圆点；未记录日期不连接。

### 2. 实修图

- 横轴：日期，每天一个刻度，最后一天显示 `31日`
- 纵轴：实际时长，单位分钟
- 纵轴范围：`0–120`
- 刻度间隔：`15 分钟`
- 曲线：普通折线
- 数据点：实心圆点
- 未记录日期不连接

值直接取自矩阵中的分钟数，不做归一化。

持五戒等勾选习惯不进入实修折线图，但会参与每日总体得分。

### 3. 阅读图

- 横轴：日期，每天一个刻度，最后一天显示 `31日`
- 纵轴：实际时长，单位分钟
- 纵轴范围：`0–60`
- 刻度间隔：`10 分钟`
- 曲线：普通折线
- 数据点：实心圆点
- 未记录日期不连接

值直接取自矩阵中的分钟数，不做归一化。

## API

```text
GET    /api/month?year=2026&month=8
       获取月度习惯、记录、每日统计和单项统计

PUT    /api/records
       保存某习惯某天的记录

DELETE /api/records?month=2026-08
       清空某月记录

POST   /api/habits
       新增习惯

PATCH  /api/habits/:id
       编辑习惯

DELETE /api/habits/:id
       删除习惯

GET    /api/weekly?weekStart=2026-08-24
       获取一周计划、任务、日记和完成状态

POST   /api/weekly/tasks
       新增周任务

PATCH  /api/weekly/tasks/:id
       更新周计划任务

DELETE /api/weekly/tasks/:id
       删除任务

POST   /api/weekly/records
       为某天添加每日记录

PATCH  /api/weekly/records/:id
       更新每日记录的实际时长或完成状态

DELETE /api/weekly/records/:id
       删除每日记录

PUT    /api/weekly/diary
       保存某天日记
```

## 目录结构

```text
app/
  api/                        月数据、习惯、打卡记录接口
  page.tsx                    月视图入口
components/
  daily-chart.tsx             每日总体得分图
  sleep-time-chart.tsx        睡觉偏离目标图
  practice-duration-chart.tsx 实修/阅读时长图
  dashboard.tsx               页面、矩阵和管理面板
lib/
  db.ts                       SQLite 初始化、迁移和写入
  data.ts                     月度统计汇总
  scoring.ts                  单习惯评分算法
  types.ts                    共享类型
```

## 后续计划

- 按星期排期
- 月度对比与筛选
- PWA 安装和每日提醒
- 登录与多设备同步
- CSV 导入导出
