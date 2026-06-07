# KanCollect TodoList — Claude Code 規則

## Push 前必做：bump sw.js CACHE 版號

每次 push 前，必須更新 `sw.js` 第 1 行的 `CACHE` 常數：

- 格式：`kancollect-YYYY-MM-DD-X`
- `YYYY-MM-DD`：push 當天的日期
- `X`：當天第一次 push 用 `a`，同一天多次 push 依序用 `b`、`c`、`d`...

```js
// 範例
const CACHE = 'kancollect-2026-06-08-a';
```

## 不納入 commit 的檔案

以下檔案不要 `git add`：

- `.claude/`
- `TODO_LIST_PLAN.md`

## Commit 訊息格式

- 語言：英文
- 格式：一行主旨簡短描述本次變更，必要時空一行後補充細節

## Push 對象

```
git push  →  origin/main
```
