# v1.4.2 验证边界

修复：独立页面采用原生模态容器；添加规则入口移至清理页顶部；兼容宿主事件 off/removeListener 与酒馆助手事件常量。更新 manifest 至独立入口 index-v1.4.2.js，并更新所有模块查询版本以避免旧缓存。

运行：test.cjs、host-test.cjs、native-test.cjs、cleanup-test.cjs、gallery-test.cjs、startup-test.cjs、dom-test.cjs、modal-test.cjs 全部通过；git diff --check 通过。

模态测试对 showModal/close 使用 DOM 测试替身，仅证明调用路径与生命周期，不证明浏览器 top-layer 视觉效果。真实浏览器测试未完成，本次未运行用户云酒馆，不宣称修复了所有环境中的编辑锁定。
