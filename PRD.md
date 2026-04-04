# 3DModelAI 项目需求文档 (PRD)

| 项目名称 | 3DModelAI (基于腾讯混元生3D) |
| :--- | :--- |
| 版本 | v1.0.0 |
| 核心目标 | 提供一个轻量、安全的 Web 界面，调用腾讯云 API 实现文生3D和图生3D，并支持 3D 预览与打印模型下载。 |
| 部署方式 | Vercel / Netlify (Serverless) |
| 包管理器 | pnpm |

---

## 1. 项目概述
### 1.1 背景
腾讯混元生3D (Tencent Hunyuan 3D) 提供了高质量的 3D 生成能力，但官方控制台主要面向开发者。本项目旨在构建一个用户友好的前端界面，允许用户使用自己的 API 密钥快速生成、预览并下载可用于 3D 打印的模型。

### 1.2 目标用户
*   3D 打印爱好者
*   独立游戏开发者
*   需要快速原型制作的设计师

---

## 2. 核心功能需求

### 2.1 鉴权管理 (Security & Auth)
*   **[F1] 用户自备密钥 (BYOK)**：应用不存储任何全局 API 密钥。用户需在界面输入自己的腾讯云 `SecretId` 和 `SecretKey`。
*   **[F2] 本地持久化**：密钥仅保存在用户浏览器的 `localStorage` 中。
*   **[F3] 地域设置**：默认调用地域为 `ap-shanghai`。

### 2.2 3D 模型生成 (Generation)
*   **[F4] 文生 3D (Text-to-3D)**：
    *   支持中英文 Prompt 输入。
    *   内置“3D 打印优化”开关，开启后自动在 Prompt 后追加 `manifold, water-tight, high detail` 等词汇。
*   **[F5] 图生 3D (Image-to-3D)**：
    *   支持图片上传（PNG/JPG/JPEG）。
*   **[F6] 任务提交与追踪**：
    *   采用异步模式：提交任务获取 `JobId`。
    *   前端进度条显示：每 5 秒自动轮询任务状态（WAIT, RUN, DONE, FAIL）。

### 2.3 预览与交付 (Preview & Delivery)
*   **[F7] 3D 模型预览**：
    *   集成 `<model-viewer>`，支持旋转、缩放、平移。
*   **[F8] 多格式导出 (3D 打印支持)**：
    *   提供按钮下载生成的 **GLB** 或 **OBJ** 文件。
    *   **STL 转换**：集成 `three.js`，支持在浏览器端将模型实时转换为 **STL** 格式，方便 3D 打印用户。

---

## 3. 技术方案 (Technical Stack)

*   **前端框架**: Next.js (App Router) + TypeScript
*   **UI 组件库**: Tailwind CSS + Shadcn UI + Lucide Icons
*   **3D 引擎**: 
    *   预览：`@google/model-viewer`
    *   转换：`three.js` (用于导出 STL)
*   **后端 API**: Next.js API Routes (Serverless)
    *   角色：作为 API 代理，处理跨域并转发请求。
    *   依赖：`tencentcloud-sdk-nodejs`
*   **存储**:
    *   密钥存储：浏览器 `localStorage`
    *   文件存储：无（直接使用腾讯云返回的临时链接）

---

## 4. 用户交互流程 (User Flow)

1.  **初始化**：用户访问网页，在设置面板输入 `SecretId` / `SecretKey`。
2.  **模式选择**：切换“文生3D”或“图生3D”。
3.  **提交任务**：上传图片或输入文字，点击生成。
4.  **轮询状态**：界面实时反馈任务进度。
5.  **结果预览**：任务完成后自动加载 3D 模型。
6.  **一键导出**：用户选择“导出 STL”或“下载原始 GLB”。

---

## 5. 非功能性需求

*   **性能**：首页加载时间 < 2s。
*   **响应式**：适配桌面端和移动端浏览器。
*   **稳定性**：优雅处理 API 超时、欠费、Prompt 敏感词过滤等错误提示。

---

## 6. 后续规划 (Roadmap)
*   **v1.1**: 集成腾讯云背景分割 API (自动抠图)。
*   **v1.2**: 简单的 3D 模型预处理（如模型简化、缩放）。
*   **v1.3**: 支持本地历史记录（保存生成过的模型 URL 和缩略图）。
