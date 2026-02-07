## ADDED Requirements

### Requirement: package.json 解析
系统 SHALL 支持 package.json 的 `main`/`module`/`exports` 解析。

#### Scenario: main 字段
- **GIVEN** `/pkg/package.json` 里有 `main: "dist/index.js"`
- **WHEN** `import '/pkg'`
- **THEN** Loader SHALL 解析为 `/pkg/dist/index.js`

#### Scenario: module 字段
- **GIVEN** `/pkg/package.json` 里有 `module: "esm/index.js"`
- **WHEN** ESM import `/pkg`
- **THEN** Loader SHALL 优先加载 `/pkg/esm/index.js`

#### Scenario: exports 字段
- **GIVEN** `/pkg/package.json` 里有 `exports: { ".": "./src/index.js" }`
- **WHEN** `import '/pkg'`
- **THEN** Loader SHALL 解析为 `/pkg/src/index.js`

### Requirement: ESM 依赖扫描
系统 SHALL 支持 ESM 的静态依赖扫描与加载。

#### Scenario: ESM import 链
- **GIVEN** `/index.ts` import `./dep`
- **WHEN** 执行 `/index.ts`
- **THEN** Loader SHALL 解析并加载 `/dep.ts`

### Requirement: Core Module Polyfills
系统 SHALL 提供基础核心模块 polyfill。

#### Scenario: path 模块
- **WHEN** 执行 `path.join('/a', 'b')`
- **THEN** 返回 `/a/b`

#### Scenario: fs 模块
- **GIVEN** `/data.txt` 存在于 VFS
- **WHEN** 执行 `fs.readFile('/data.txt')`
- **THEN** 返回文件内容
