# @vitamin-bun/cli

命令行工具。

## 安装

```bash
bun add @vitamin-bun/cli
```

## 功能

- ⏳ 开发服务器（计划中）
- ⏳ 生产构建（计划中）
- ⏳ 类型检查（计划中）
- ⏳ 代码生成（计划中）

## 使用示例

```bash
# 启动开发服务器
vitamin dev

# 指定端口
vitamin dev --port 8080

# 构建生产版本
vitamin build

# 类型检查
vitamin typecheck

# 运行测试
vitamin test
```

## 命令列表

### `vitamin dev`

启动开发服务器，支持热重载。

选项：
- `-p, --port <port>` - 端口号（默认：3000）
- `-h, --host <host>` - 主机地址（默认：localhost）

### `vitamin build`

构建生产版本。

选项：
- `-o, --outDir <dir>` - 输出目录（默认：dist）

### `vitamin typecheck`

运行 TypeScript 类型检查。

## API 文档

详见 [项目文档](https://github.com/aniwei/vitamin-bun)。

## License

MIT © aniwei
