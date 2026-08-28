# 习惯打卡 Web App

一个按月记录每日习惯的最小可用版本：

- 月度习惯矩阵，支持勾选和分钟/次数录入
- 每日总体完成率面积图
- 单项习惯完成统计条形图
- 今日快捷打卡
- 月度总览、连续达标天数
- 电脑和手机响应式页面
- SQLite 本地持久化

## 本地运行

```bash
npm install
npm run build
npm start
```

然后访问：

- 本机：http://localhost:3000
- 同一局域网内的手机：http://192.168.31.56:3000

首次启动会自动创建 5 个示例习惯，并生成当前月份的演示数据。页面可以直接修改，也可以点击右上角“清空本月”。

数据库文件保存在：

```text
data/habits.db
```

## 开发模式

```bash
npm run dev
```

部分 macOS 环境下的文件监听器可能出现 `EMFILE` 警告；如果遇到，直接使用 `npm run build && npm start` 即可，不影响使用生产模式。

## Docker / VPS

```bash
docker compose up -d --build
```

应用监听 `3000` 端口，SQLite 数据保存在 Docker volume `habit-data` 中。

## 目录结构

```text
app/
  api/          月数据、习惯、打卡记录接口
  page.tsx      月视图入口
components/     页面、表格和图表组件
lib/
  db.ts         SQLite 初始化和写入
  data.ts       月度统计汇总
  types.ts      共享类型
```

## 后续计划

- 习惯编辑和按星期排期
- 月度对比与筛选
- PWA 安装和每日提醒
- 登录与多设备同步
- CSV 导入导出
