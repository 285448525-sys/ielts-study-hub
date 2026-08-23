# 本次更新概览：语料库表格化 + 看中文写英文默写

## 完成内容
1. **语料库列表改为紧凑表格**（corpus.js / common.css）
   - 左列：中文；右列：英文。
   - 移除原列表的播放按钮与删除按钮，仅保留清晰表格展示。

2. **新增「开始默写」功能**（corpus.js / corpus.html / common.css）
   - 「句子听写」卡片新增「✍ 开始默写」按钮。
   - 点击后进入练习区：每行显示中文提示 + 英文输入框 + 听发音按钮。
   - 提交后先进行本地词级比对，给出准确率与漏词；若已配置 DeepSeek Key，则叠加 AI 批改 note。
   - 结果清晰呈现：你的写法、正确写法、漏词、AI 说明、全对句数。

3. **本地验证**
   - `node --check js/corpus.js` 语法通过。
   - agent-browser 已验证：表格展示正常、默写 UI 渲染正常。
   - 本地端口被考研网站占用导致后续验证串站，属环境端口冲突，非代码问题。

4. **部署**
   - commit: `fed71be`
   - 已 push origin main，Cloudflare Pages 自动部署。

## 文件变更
- `C:\Users\Camille\Desktop\雅思\ielts-study-hub\corpus.html`
- `C:\Users\Camille\Desktop\雅思\ielts-study-hub\css\common.css`
- `C:\Users\Camille\Desktop\雅思\ielts-study-hub\js\corpus.js`
