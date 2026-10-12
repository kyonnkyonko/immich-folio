# kyonnkyonko/immich-folio：自訂修改紀錄

這是 [ralksta/immich-folio](https://github.com/ralksta/immich-folio) 的 fork，給「庭園美景」生活日誌網站（https://photos.kyonnkyonko.cc）用。
這份文件列出**跟官方不一樣的地方**，官方出新版、合併進來之後，照第 3 節逐項檢查每個功能還在不在。

最後更新：2026-10-08　｜　目前部署：`zh-tw` 分支（官方 v0.20.1＋下列 A、B、C 三項修改；commit 見第 6 節）

---

## 1. 分支與映像

| 項目           | 內容                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`         | 跟官方一致，只用 GitHub 的「Sync fork」更新，**不放自己的修改**                                                                                                |
| `zh-tw`        | `main`＋下列所有修改，**部署用的分支**                                                                                                                         |
| 映像           | `ghcr.io/kyonnkyonko/immich-folio:zh-tw`（公開）；每次建置另有 `sha-<完整 commit>` 標籤可用來還原                                                              |
| 建置           | Actions「Publish Docker Image」手動執行：`gh workflow run docker-publish.yml -R kyonnkyonko/immich-folio --ref zh-tw`                                          |
| 部署           | VM `~/tingyuan-journal/.env`：`FOLIO_IMAGE=ghcr.io/kyonnkyonko/immich-folio`、`FOLIO_VERSION=zh-tw`；`docker compose pull folio && docker compose up -d folio` |
| 部署設定的說明 | 私有 repo kyonnkyonko/tingyuan-journal 的 `docs/folio-網站設定交接.md` 第 9 節                                                                                 |

---

## 2. 修改清單

### A. 繁體中文訪客介面（2026-10-07，commit `9b777f8`、`9c48529`）

**目的**：官方只有英／德／法／西／義／荷，`lang: zh-TW` 會顯示英文。加一個繁中語系檔，訪客看到的按鈕、選單、提示都變中文。

| 檔案                                               | 改了什麼                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `lib/i18n/locales/zh.ts`                           | **新增**：繁中語系檔（約 180 條），型別是 `Dictionary`，跟 `en.ts` 一一對應          |
| `lib/i18n/index.ts`                                | `import { zh }`、`SUPPORTED_LOCALES` 加 `'zh'`、`DICTIONARIES` 加 `zh`               |
| `lib/__tests__/i18n.test.ts`                       | `TRANSLATIONS`、`PLURAL_TABLE`、聯絡表單保存天數、`resolveLocale('zh-TW')` 都加上 zh |
| `app/admin/components/settings/GeneralSection.tsx` | 管理介面語言選單加 `<option value="zh-TW">繁體中文 (zh-TW)</option>`                 |

**使用者指定的用詞**（改譯文時保持一致）：

| 英文              | 中文                                                       |
| ----------------- | ---------------------------------------------------------- |
| Gallery           | **相片集**（返回相片集、相片集載入中、這個相片集需要密碼） |
| Album             | 相簿（「N 本相簿」、上一本相簿）                           |
| Journal           | 日誌                                                       |
| by &lt;author&gt; | **文：&lt;author&gt;**（全形冒號）                         |
| Slideshow         | 輪播                                                       |
| N photos          | N 張照片（數字前後留空格）                                 |

**自動檢查**：

```bash
npx tsc --noEmit                              # 官方在 en.ts 加了新字串 → zh.ts 型別錯誤，會列出缺哪幾個 key
npx vitest run lib/__tests__/i18n.test.ts     # 檢查：每個 key 都有、沒有漏翻成英文、數量文字、日期格式
```

`en.ts` 有新字串時：照上面的用詞補進 `zh.ts`，測試的「leaves no English string untranslated」會抓到漏翻的。

**手動檢查**（部署後，外部網址）：

```bash
curl -s https://photos.kyonnkyonko.cc/journal | grep -o -E "首頁|日誌|地圖|相片集|跳到主要內容|故事與隨筆" | sort | uniq -c
curl -s https://photos.kyonnkyonko.cc/journal | grep -o -E ">(Home|Journal|Map|Skip to content)<"   # 應該沒有輸出
```

- [ ] 導覽列：首頁／日誌／地圖（有 about.md 時還有「關於」）
- [ ] `/journal` 標題下的小字是「故事與隨筆」；沒有文章時顯示「目前還沒有發佈的日誌。」
- [ ] 有密碼的日誌：顯示「這篇日誌需要密碼。」、輸入框「輸入密碼」
- [ ] 相簿燈箱：「第 3 張，共 20 張」、資訊面板「相機／鏡頭／地點」
- [ ] 日期是台灣格式（例如「2025年10月5日」）
- [ ] 管理介面 → Settings → General → Language 選單有「繁體中文 (zh-TW)」

**容易出問題的地方**：

- 官方改了 `resolveLocale` 或 `SUPPORTED_LOCALES` 的寫法 → 合併時 `index.ts` 會衝突，保留官方的新寫法再把 `zh` 加回去
- 官方自己加了中文（`zh` 或 `zh-TW`）→ 比較兩份譯文，可以改用官方的，但要套回上面的用詞；之後就能刪掉這項修改

### B. Journal Studio 復原／重做（2026-10-07，commit `3cdaa4b`）

**目的**：官方的日誌編輯器沒有復原。加上 Undo／Redo，往前、往後各最多 5 步。

| 檔案                                                         | 改了什麼                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `app/admin/components/journal/undoHistory.ts`                | **新增**：歷史紀錄的純函式（`recordEdit`、`undoEdit`、`redoEdit`、`isTextEditingTarget`），`UNDO_LIMIT = 5`、`GROUP_MS = 1000` |
| `app/admin/components/journal/JournalEditor.tsx`             | 見下方                                                                                                                         |
| `app/admin/components/journal/journal-studio.css`            | 新增 `.journal-editor-history`（兩個按鈕並排）                                                                                 |
| `app/admin/__tests__/journal-undo-history.test.ts`           | **新增**：純函式測試（步數上限、分組、重做清除）                                                                               |
| `app/admin/components/__tests__/JournalEditor-undo.test.tsx` | **新增**：實際渲染編輯器的測試（按鈕、5 步上限、⌘Z／⇧⌘Z、文字欄位內不攔截）                                                    |

`JournalEditor.tsx` 的改動（合併衝突最可能發生在這裡）：

1. `history` state（`useState<UndoHistory>(emptyHistory)`）
2. **`applyEdit(nextMarkdown, nextParsed, key?)`**：所有修改都經過它，先記下修改前的 markdown 再更新。`handleMarkdownChange`（key `markdown`）、`handleBlocksChange`（可帶 key）、`handleFrontmatterChange`（key `frontmatter:<欄位>`）、`handleTogglePublish` 都改成呼叫它
3. `handleUpdateBlock` 呼叫 `handleBlocksChange(blocks, \`block:${index}\`)`：同一個區塊連續打字算一步
4. `showHistoryState`、`handleUndo`、`handleRedo`：退回到檔案原本的樣子時 `dirty` 變回 false（按鈕顯示 Saved）
5. 載入（load effect）、`discardDraft`、`restoreConflictingDraft` 都會 `setHistory(emptyHistory())`
6. 快速鍵 effect 改用 `useLatest({ save, undo, redo })`：⌘S 存檔；在文字欄位外 ⌘Z 復原、⇧⌘Z／Ctrl+Y 重做
7. 上方工具列（`journal-editor-topbar-right` 最前面）加 `↶ Undo`、`↷ Redo` 兩個按鈕（`aria-label` 是 Undo／Redo，測試靠這個找按鈕）

**自動檢查**：

```bash
npx vitest run app/admin/__tests__/journal-undo-history.test.ts app/admin/components/__tests__/JournalEditor-undo.test.tsx
```

**手動檢查**（管理介面 → Journal → 打開一篇 → Edit in Studio）：

- [ ] 上方右邊有「↶ Undo」「↷ Redo」，剛打開時兩個都不能按
- [ ] 按 7 次「+ Quote」→ 按 5 次 Undo 剩 2 個新區塊，第 6 次按不了；再按 5 次 Redo 回到 7 個
- [ ] 一路 Undo 到剛打開的樣子，存檔按鈕變回「✓ Saved」
- [ ] 在區塊的文字欄位打一句話 → 按 Undo，整句一次消失（不是一個字一個字）
- [ ] 點在文字欄位外按 ⌘Z／⇧⌘Z 有效；游標在文字欄位裡按 ⌘Z 只復原那個欄位的字
- [ ] 改了 Story Settings（標題、日期、封面）也能復原

**容易出問題的地方**：

- 官方在 `JournalEditor.tsx` **新增了別的修改方式**（新按鈕、新的 handler 直接 `setRawMarkdown`／`setParsed`）→ 那種修改不會進歷史。合併後搜尋 `setRawMarkdown(`：除了 `applyEdit`、`showHistoryState`、載入、存檔後改寫、`discardDraft`、`restoreConflictingDraft` 以外，不該有別的地方直接呼叫
- 官方自己做了復原功能 → 比較後二選一，不要兩套並存

### C. 管理介面：每日頁收合成一組（2026-10-08）

**目的**：網站有 366 個每日頁（`/tyday-01_01`～`/tyday-12_31`，由 photo-journal repo 的 `scripts/tyday/make_pages.py` 產生），在 admin 的 Pages 分頁全擠在「Not in menu」。改成另外一組「每日照片 tyday-\*」，**預設收合**。

| 檔案                                              | 改了什麼                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/admin/components/page-builder/pageGroups.ts` | **新增**：`FOLDED_PAGE_PREFIX = 'tyday-'`、`FOLDED_GROUP_LABEL`、`isFoldedPage`、`splitFoldedPages`                                          |
| `app/admin/components/PageBuilder.tsx`            | `foldedOpen` state；`offMenuPages` 拆成 `offMenuRegular`／`offMenuFolded`（每日頁依日期排序）；「Not in menu」只列一般頁；下面加可收合的一組 |
| `app/admin/styles/redesign.css`                   | 新增 `.pb-group-toggle`（標題列變成按鈕）                                                                                                    |
| `app/admin/__tests__/page-groups.test.ts`         | **新增**：判斷與拆分的測試                                                                                                                   |

`PageBuilder.tsx` 的改動重點：每日頁那一組的每一列沿用 `off-<slug>` 的 id，所以 `handleMenuDragEnd` 不用改，每日頁一樣可以拖進選單；搜尋框有字時這組自動展開。

**自動檢查**：

```bash
npx vitest run app/admin/__tests__/page-groups.test.ts
```

**手動檢查**（admin → Pages）：

- [ ] 左側「Not in menu」只有一般頁面，數字不含 366 個每日頁
- [ ] 下面有「▸ 每日照片 tyday-\*　366」，預設收合；點一下展開（▾），依日期 01_01 → 12_31 排列
- [ ] 點其中一頁可以在右邊編輯
- [ ] 搜尋框打「10月8日」或「10_08」→ 這組自動展開並只顯示符合的頁面

**容易出問題的地方**：

- 官方改了 `PageBuilder.tsx` 裡「Not in menu」那一段（`offMenuPages`、`OffMenuDropZone`）→ 合併時衝突，照上表把拆分和收合的那一組加回去
- 每日頁的網址改了開頭（不再是 `tyday-`）→ 改 `pageGroups.ts` 的 `FOLDED_PAGE_PREFIX`

### D. Journal Studio：複製區塊、挑選器長按看大圖、照片依日期加小標（2026-10-12）

**目的**：使用者要求。（1）日誌／頁面編輯時，區塊可以複製；（2）挑選照片時，滑鼠（或手指）長按顯示大圖；（3）「+ Photos」一次加入多張時，可以依拍攝日期分組，每天前面加 `##### 09/03` 小標。

| 檔案                                                                              | 改了什麼                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/admin/components/journal/blockOps.ts`                                        | 新增 `duplicateBlock`（深拷貝插在原區塊下方）、`photoDateLabel`（`localDateTime` → `MM/DD`，沒有就用 `fileCreatedAt` 的瀏覽器時區日期）、`createPhotoBlocksByDate`（依拍攝時間排序、每天一個 level 5 標題；沒有日期的照片放最後）                                  |
| `app/admin/components/journal/JournalEditor.tsx`                                  | 每個區塊的操作列多一個複製按鈕（`IconCopy`，`aria-label="Duplicate block"`）；「+ Photos」傳 `dateHeadingsOption: true`，勾選時用 `createPhotoBlocksByDate`；`onSelectMany` 多傳第二個參數 `extra`                                                                 |
| `app/admin/components/journal/BlockFields.tsx`                                    | `AssetPickTarget.onSelectMany(ids, extra)`、`dateHeadingsOption`；標題層級選單加 H4、H5（日期）                                                                                                                                                                    |
| `app/admin/components/AssetPicker.tsx`                                            | `AssetInfo.localDateTime`；長按 400ms（`LONG_PRESS_MS`）顯示 `.asset-picker-preview` 大圖，放開或移開就關，長按那一下不算選取；多選時可顯示「依日期加小標」勾選框（記在 localStorage `folio-picker-date-headings`）；`onSelectMany(ids, { metaOf, dateHeadings })` |
| `app/admin/styles/asset-picker.css`                                               | `.asset-picker-preview`、`.asset-picker-date-headings`；縮圖禁止選取文字和 iOS 長按選單                                                                                                                                                                            |
| `app/api/admin/thumbnail/[id]/route.ts`                                           | `?size=preview` 回大圖（其他值一律 `thumbnail`）                                                                                                                                                                                                                   |
| `app/api/admin/assets/route.ts`、`app/api/admin/albums/[albumId]/assets/route.ts` | 回傳多帶 `localDateTime`                                                                                                                                                                                                                                           |
| `app/[...path]/essay.css`                                                         | 新增 `.essay-heading--4`、`.essay-heading--5`（小字、淡色、等寬數字的日期標籤）                                                                                                                                                                                    |
| `app/admin/__tests__/journal-duplicate-dates.test.ts`                             | **新增**：複製、日期標籤（含跨 UTC 日界）、分組、`#####` 存檔讀回                                                                                                                                                                                                  |
| `app/admin/components/__tests__/AssetPicker-preview.test.tsx`                     | **新增**：長按顯示大圖且不選取、短按仍選取、勾選框與日期交給呼叫端                                                                                                                                                                                                 |

**自動檢查**：

```bash
npx vitest run app/admin/__tests__/journal-duplicate-dates.test.ts app/admin/components/__tests__/AssetPicker-preview.test.tsx
```

**手動檢查**（admin → Journal 或 Pages 編輯器）：

- [ ] 每個區塊右上角：上移、下移、**複製**、刪除；按複製後下方出現一樣的區塊，可以⌘Z 復原
- [ ] 「+ Photos」挑選器裡按住一張縮圖約半秒 → 出現大圖和檔名日期，放開就消失，那張沒有被勾選
- [ ] 下方有「依日期加小標（##### 09/03）」；勾選後加入不同天的照片 → 依日期排好，每天前面有「09/03」小標
- [ ] 預覽／網站上日期小標是小字淡色

**容易出問題的地方**：

- 官方改了 `AssetPicker` 的 `onSelectMany` 簽名或縮圖按鈕 → 合併時衝突，照上表把長按和第二個參數加回去
- 官方的編輯器也加了複製 → 改用官方的，刪掉這裡的按鈕和 `duplicateBlock`
- 頁面的 `#####` 只是一般標題，官方解析器不變就不用改 `lib/journal.ts`

---

## 3. 官方出新版時的檢查流程

1. **看官方改了什麼**：讀官方 `CHANGELOG.md`，留意 `lib/i18n/`、`app/admin/components/journal/` 有沒有被改
2. **同步 main**：GitHub fork 頁面按「Sync fork」，或

   ```bash
   git remote add upstream https://github.com/ralksta/immich-folio.git   # 第一次才需要
   git fetch upstream && git checkout main && git merge --ff-only upstream/main && git push
   ```

3. **合併進 zh-tw**：

   ```bash
   git checkout zh-tw && git merge main
   ```

   衝突大多在 `lib/i18n/index.ts`、`lib/__tests__/i18n.test.ts`、`JournalEditor.tsx`，照第 2 節「改了什麼」把修改加回去

4. **跑完整檢查**（全部要過）：

   ```bash
   npm ci
   npx tsc --noEmit
   npx vitest run                      # 完整測試；2026-10-08 是 213 個檔案、2736 個測試
   npx eslint lib/i18n app/admin/components/journal
   ```

5. **push、建映像**：`git push`，再 `gh workflow run docker-publish.yml -R kyonnkyonko/immich-folio --ref zh-tw`，等 Actions 成功
6. **部署**（VM）：`cd ~/tingyuan-journal && docker compose pull folio && docker compose up -d folio`
7. **逐項手動檢查**：第 2 節每一項的「手動檢查」清單
8. **更新這份文件**：最上面的「目前部署」、第 5 節的紀錄表

## 4. 出問題時還原

換回上一個能用的版本（每次建置都有 `sha-` 標籤，列表：`https://github.com/kyonnkyonko/immich-folio/pkgs/container/immich-folio`）：

```bash
# VM：~/tingyuan-journal/.env
FOLIO_VERSION=sha-3cdaa4b5b7ce790141d5408616cd8e3e000bc932   # 例：2026-10-07 的版本
docker compose up -d folio
```

完全換回官方英文版：`FOLIO_IMAGE=ghcr.io/ralksta/immich-folio`、`FOLIO_VERSION=latest`。
⚠️ 改 `.env` 會連帶重建 `immich_server`（它也讀 `.env`），Immich 會中斷約 1 分鐘。

## 5. 不在程式碼裡的網站設定

這些在 VM 的 `/data/folio-content/settings.yaml`（不在這個 repo），升級後也要確認還有效：

| 設定                      | 值                | 檢查                                                     |
| ------------------------- | ----------------- | -------------------------------------------------------- |
| `title`                   | 庭園美景          | 首頁標題                                                 |
| `lang`                    | zh-TW             | 介面是中文（見 A）                                       |
| `theme.preset`            | minimal           | 官方改名或移除主題時，網站會出現 `Unknown theme preset`  |
| `theme.accent`            | `#8b5cf6`（紫色） | 連結、滑過的顏色                                         |
| `theme.fonts`（三格）     | Zen Maru Gothic   | 首頁原始碼有 `/api/fonts/css?family=Zen%20Maru%20Gothic` |
| `heroStyle`               | typographic       | 首頁只有文字標題                                         |
| `seo.noIndex`／`noFollow` | true              | 首頁原始碼有 `noindex`                                   |

## 6. 升級紀錄

| 日期       | 官方版本 | zh-tw commit | 結果 | 備註                                             |
| ---------- | -------- | ------------ | ---- | ------------------------------------------------ |
| 2026-10-07 | v0.20.1  | `9c48529`    | ✅   | 第一次部署：繁中介面                             |
| 2026-10-07 | v0.20.1  | `3cdaa4b`    | ✅   | 加復原／重做；完整測試 2733 通過                 |
| 2026-10-08 | v0.20.1  | `b66ee75`    | ✅   | admin 每日頁收合；完整測試 2736 通過             |
| 2026-10-12 | v0.20.1  | `723e3e3`    | ✅   | 複製區塊、長按大圖、日期小標；完整測試 2746 通過 |
