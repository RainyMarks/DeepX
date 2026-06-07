# DeepX Portable

DeepX 是一个源码公开、非商业许可的本地 AI coding agent 桌面版。用户自己填写模型 API key，配置、会话、日志、缓存指标和本地密钥默认都保存在应用目录的 `data/` 下。

## 运行

1. 解压 portable zip。
2. 运行 `DeepX.exe`。
3. 在“设置 -> 模型”里填写自己的 API key。
4. 保存后测试连接。

发行包默认不包含 `data/secrets.local.json`，也不包含任何个人 API key。

## 目录

```text
resources/                 Electron 资源、deepx-core.exe、图标、原生依赖
data/config/               设置
data/sessions/             会话
data/logs/                 日志
data/plugins/              插件
data/skills/               技能
data/cache-metrics/        缓存与用量指标
data/secrets.local.json    用户本机 API key，发行包不包含
```

## 声明

DeepX 是独立项目，不是 DeepSeek 官方项目，也不是 OpenAI/Codex 官方项目。

## License

DeepX 使用 `PolyForm-Noncommercial-1.0.0`。源码可以查看、学习、修改和在非商业场景下分发；未经授权不得用于商业目的。
