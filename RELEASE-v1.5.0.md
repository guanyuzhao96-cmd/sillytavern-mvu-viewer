# v1.5.0 编辑流程重写与浏览器证据

## 实际改动

草稿编辑和文件导入仅检查有效数据、当前聊天和最新消息身份，不再由「正在生成」的旧标志控制按钮。生成过程中可准备草稿，真正写入仍拒绝进行中的生成、MVU 更新、聊天变化、消息切页、原表变化。

原生入口直接导入宿主 script.js、group-chats.js 与 st-context.js。优先读取实际 isGenerating()，旧版回退到实时 is_send_press/is_group_generating 导出。事件只用于通知刷新，不以过期 generation-start 标志覆盖已确认的宿主空闲状态。兼容路径识别 streamingProcessor.isStopped 与已中止信号。显示、导入和保存错误明确保留。

官网源码核对：SillyTavern release/public/script.js 的 isGenerating 导出、StreamingProcessor.onErrorStreaming 设置 isStopped（不设置 isFinished）；release/public/scripts/group-chats.js 的群聊状态导出；release/public/scripts/st-context.js 的 getContext 导出。读取日期 2026-10-16。未声称用户云酒馆使用同一版本。

## 已执行

`npm test`：九个代码/DOM/宿主模拟测试文件通过。

`FONTCONFIG_FILE=... node browser-edit-test.cjs`：Chromium 153.0.8010.0，390×844。完整原生入口以 ES 模块加载，测试宿主通过 HTTP 提供持久化测试数据：

- 固定旧版提交 8e66fba 在已停止但 isFinished=false 的错误流状态下，编辑与导入按钮均禁用。
- 新版实际点击编辑，将 70 改为 123，确认保存，页面刷新后读回 123。
- 实际选择 JSON 文件，导入 456，确认保存，未丢弃其他变量表字段。
- 人为发出过期的 generation-start 事件，但原生 isGenerating=false，编辑与保存仍成功。
- 正在生成时可编辑 789 的草稿，保存被拒绝；生成结束后同一草稿保存，刷新后读回 789。
- 历史楼层仍拒绝写入。无浏览器脚本错误。

## 边界

这是实际 Chromium 点击测试，宿主接口与 HTTP 保存服务为测试夹具。未进入用户云酒馆，不能据此宣称该云酒馆的登录、分叉接口与服务器落盘均已验收。浏览器验收和模拟验收分别记录，不混称实机。

测试依赖属于开发依赖，插件运行不加载 npm 包，也不向外发送 MVU 数据。
