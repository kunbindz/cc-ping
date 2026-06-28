# cc-ping — Master Plan

> Desktop notification + mascot pop-out cho Claude Code: khi một task chạy xong (hoặc Claude đang đợi input), phát một tiếng "ting" và cho mascot chạy ra từ góc desktop để báo "quay lại làm việc đi".
>
> Tài liệu này là spec để Claude Code thực thi. Mỗi phase có mục tiêu, file đụng tới, và acceptance criteria rõ ràng. Thực hiện tuần tự, không nhảy phase.

---

## 0. Bối cảnh & quyết định kiến trúc

**Vấn đề:** Auto mode của Claude Code chạy lâu. User tab sang việc khác, lúc Claude xong không có tín hiệu nào → mất thời gian quay lại kiểm tra.

**Cơ chế nền tảng (đã verify trên Claude Code v2.1.141+):**

- Claude Code có hệ thống **hooks**: shell command/HTTP/prompt chạy tại các điểm trong vòng đời session. Cấu hình trong `.claude/settings.json`.
- Event ta cần:
  - **`Stop`** — fire khi agent kết thúc một turn (task xong). Không có matcher. stdin nhận JSON: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, và `stop_hook_active`.
  - **`SubagentStop`** — fire khi sub-agent xong. Có `agent_id`, `agent_type`.
  - **`Notification`** — fire khi Claude cần input (đợi approval / idle). Dùng để phân biệt "xong rồi" với "đang đợi bạn bấm".
- Command hook đọc JSON qua **stdin**, trả kết quả qua **exit code + stdout JSON**. Exit 0 = success, Claude parse stdout JSON.

**Ràng buộc quan trọng (ảnh hưởng thiết kế tiếng "ting"):**

- Từ v2.1.139, command hook chạy trong session riêng **không có controlling terminal**, không mở được `/dev/tty`. Windows vốn không có `/dev/tty`.
- Để ring bell / set window title / desktop notification qua terminal: hook trả trường **`terminalSequence`** trong stdout JSON (yêu cầu **v2.1.141+**). Field này chỉ nhận escape sequence trong allowlist (BEL `\u0007` hợp lệ; CSI color, OSC hyperlink, OSC clipboard bị từ chối).
- → **Quyết định:** tách làm 2 đường tín hiệu độc lập:
  1. **Terminal bell** — hook trả `terminalSequence: "\u0007"`. Race-free, chạy trong tmux/screen và Windows. Fallback luôn có.
  2. **Mascot + sound** — KHÔNG đi qua terminal. Hook làm fire-and-forget POST sang một **overlay process** chạy nền (local HTTP). Overlay tự phát sound + animate mascot. Nếu overlay chưa chạy thì hook fail im lặng.

**Quyết định stack:**

- **Hook handler (`cc-ping-hook`)**: Node.js (`.mjs`), zero-dependency, dùng built-in `http`/`fetch`. Lý do: Node có sẵn trong môi trường Claude Code; cross-platform; user (Loc) làm frontend TS nên dễ maintain.
- **Overlay (`cc-ping-overlay`)**: **Tauri** (Rust core + web frontend). Lý do: nhẹ hơn Electron nhiều (RAM/binary size), hợp Windows — OS chính của user, transparent always-on-top window dễ làm, frontend TS quen thuộc.
- **Mascot:** mascot **tự vẽ** (không dùng Claw'd của Anthropic) để tránh vấn đề trademark/IP khi publish public. Đặt một codename riêng trong repo.
- **Async:** hook chạy ở chế độ async (non-blocking) để không làm chậm việc Claude kết thúc turn.

**Non-goals (v1):**
- Không hỗ trợ claude.ai web (kiến trúc khác hẳn — cần browser extension).
- Không làm hệ thống plugin marketplace.
- Không TTS / đọc tên task bằng giọng nói (để v2).

---

## 1. Kiến trúc tổng thể

```
Claude Code ──Stop / SubagentStop / Notification hook──> cc-ping-hook (notify.mjs)
                                                             │
                                                             ├─ stdout JSON: { terminalSequence: "\u0007", async: true }
                                                             │     → terminal bell (fallback luôn chạy)
                                                             │
                                                             └─ POST http://127.0.0.1:<port>/event   (fire-and-forget, timeout ngắn)
                                                                   │  body: { type, project, sessionId, durationMs, ... }
                                                                   ▼
                                                             cc-ping-overlay (Tauri, chạy nền)
                                                                   ├─ phát sound theo type (done / waiting / error)
                                                                   ├─ animate mascot chạy ra từ góc desktop
                                                                   └─ hiển thị project name + "Task done" rồi tự ẩn
```

**Cấu trúc thư mục repo:**

```
cc-ping/
├─ README.md
├─ LICENSE                      # MIT
├─ MASTER_PLAN.md               # tài liệu này
├─ package.json                 # workspace root (pnpm)
├─ packages/
│  ├─ hook/                     # cc-ping-hook — Node, zero-dep
│  │  ├─ notify.mjs             # entrypoint hook handler
│  │  ├─ lib/
│  │  │  ├─ read-stdin.mjs
│  │  │  ├─ config.mjs          # đọc ~/.cc-ping/config.json
│  │  │  ├─ duration.mjs        # tính thời lượng turn từ state file
│  │  │  └─ post-event.mjs      # fire-and-forget POST sang overlay
│  │  ├─ install.mjs            # merge hook vào ~/.claude/settings.json
│  │  └─ package.json
│  └─ overlay/                  # cc-ping-overlay — Tauri app
│     ├─ src-tauri/             # Rust: local HTTP server + window mgmt
│     │  ├─ src/main.rs
│     │  ├─ src/server.rs       # axum/tiny-http nghe 127.0.0.1
│     │  ├─ tauri.conf.json
│     │  └─ Cargo.toml
│     ├─ src/                   # frontend: animation + sound
│     │  ├─ index.html
│     │  ├─ main.ts
│     │  ├─ mascot.ts           # state machine animation
│     │  └─ styles.css
│     ├─ assets/
│     │  ├─ mascot/             # sprite/SVG mascot tự vẽ
│     │  └─ sounds/             # ting.wav, waiting.wav, error.wav
│     └─ package.json
├─ assets/
│  └─ demo.gif                  # cho README
└─ .github/workflows/
   └─ release.yml               # build overlay cho Win/macOS/Linux
```

**Giao thức hook ↔ overlay (HTTP, JSON):**

`POST /event`
```json
{
  "type": "done | waiting | error",
  "project": "uppromote",
  "cwd": "C:\\work\\uppromote",
  "sessionId": "abc123",
  "agentType": null,
  "durationMs": 47213,
  "ts": 1719560000000
}
```
Response: `204 No Content` (overlay không cần trả gì cho hook).

`GET /health` → `200 {"ok":true,"version":"..."}` (để hook kiểm tra overlay sống mà không spam).

---

## 2. Phases

### Phase 1 — Hook handler MVP (terminal bell only)

**Mục tiêu:** Có hook chạy được, ring bell + ghi log khi task xong. Chưa cần overlay. Đây là MVP dùng được ngay.

**Files:** `packages/hook/notify.mjs`, `packages/hook/lib/read-stdin.mjs`, `packages/hook/package.json`

**Việc cần làm:**
1. `read-stdin.mjs`: đọc toàn bộ stdin, `JSON.parse`. Bọc try/catch — nếu parse lỗi thì trả object rỗng, **không bao giờ throw** (hook lỗi không được làm gián đoạn Claude).
2. `notify.mjs`:
   - Đọc JSON từ stdin.
   - Check `stop_hook_active === true` → exit 0 ngay (tránh stop-loop vô hạn).
   - Lấy `cwd` → derive `project` = basename của cwd.
   - In ra stdout JSON: `{"terminalSequence":"\u0007","async":true}`.
   - exit 0.
   - **Mọi lỗi đều nuốt** (catch-all → exit 0).
3. `install.mjs`: đọc `~/.claude/settings.json` (tạo nếu chưa có), merge block hooks cho `Stop`, `SubagentStop`, `Notification` trỏ tới `notify.mjs` bằng đường dẫn tuyệt đối. **Không ghi đè** hooks có sẵn của user — chỉ append, idempotent (chạy nhiều lần không nhân đôi).

**Acceptance:**
- Chạy `echo '{"cwd":"/tmp/foo","hook_event_name":"Stop"}' | node notify.mjs` → stdout là JSON hợp lệ chứa `terminalSequence`, exit 0.
- Truyền `{"stop_hook_active":true}` → exit 0, không in `terminalSequence`.
- Truyền stdin rác (không phải JSON) → exit 0, không throw.
- Sau `node install.mjs`, chạy Claude Code một task ngắn → nghe thấy terminal bell khi xong.

---

### Phase 2 — Config + threshold + duration

**Mục tiêu:** Chỉ báo khi task đủ lâu (tránh spam), cho user cấu hình.

**Files:** `packages/hook/lib/config.mjs`, `packages/hook/lib/duration.mjs`

**Việc cần làm:**
1. `config.mjs`: đọc `~/.cc-ping/config.json`. Default nếu thiếu:
   ```json
   {
     "minDurationMs": 10000,
     "bell": true,
     "overlay": true,
     "overlayPort": 47321,
     "sounds": { "done": "ting", "waiting": "soft", "error": "buzz" },
     "quietProjects": []
   }
   ```
2. `duration.mjs`: đo thời lượng turn.
   - Dùng một state file per-session: `~/.cc-ping/sessions/<sessionId>.json` ghi timestamp khi turn bắt đầu.
   - Vì `Stop` không có event "turn start" tương ứng dễ dùng, tiếp cận thực dụng: tại mỗi `Stop`, đọc `transcript_path` (JSONL), lấy timestamp của message **user** gần nhất và message cuối → ước lượng `durationMs`. Nếu không đọc được transcript thì `durationMs = null` (vẫn báo, coi như qua threshold).
   - Implement đọc JSONL: đọc file, split theo dòng, parse từng dòng, bỏ qua dòng lỗi.
3. `notify.mjs` cập nhật:
   - Nếu `durationMs != null && durationMs < minDurationMs` → exit 0 im lặng (không bell, không POST).
   - Nếu `project` nằm trong `quietProjects` → im lặng.
   - `Notification` event luôn báo (vì là "đang đợi bạn"), bỏ qua threshold.

**Acceptance:**
- Task < `minDurationMs` → không có bell.
- Task > threshold → có bell.
- Project trong `quietProjects` → im.
- Thiếu config file → dùng default, không crash.

---

### Phase 3 — Overlay Tauri (skeleton + local server)

**Mục tiêu:** App nền chạy được, nghe HTTP, hiện một cửa sổ trống transparent ở góc.

**Files:** `packages/overlay/src-tauri/*`, `packages/overlay/src/index.html`

**Việc cần làm:**
1. Init Tauri app. `tauri.conf.json`:
   - Window: `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`, không focus-stealing.
   - Kích thước nhỏ (vd 360×240), đặt ở góc dưới-phải màn hình chính.
   - Khởi động ẩn (`visible: false`).
2. `server.rs`: HTTP server (tiny-http hoặc axum) bind `127.0.0.1:<port>` (đọc port từ `~/.cc-ping/config.json`; fallback 47321).
   - `GET /health` → 200 JSON.
   - `POST /event` → parse body, đẩy sang frontend qua Tauri event (`app.emit("cc-ping-event", payload)`), trả 204.
   - **Chỉ bind loopback** — không nghe 0.0.0.0 (bảo mật).
3. System tray: icon + menu (Quiet toggle, Quit). App sống ở tray, không hiện trong taskbar.
4. Run-on-startup: tùy chọn (Windows: registry run key / shortcut Startup folder). Để optional, không bật mặc định.

**Acceptance:**
- `curl http://127.0.0.1:47321/health` → 200.
- `curl -X POST .../event -d '{"type":"done","project":"x"}'` → 204, frontend nhận được event (log ra console).
- App nằm ở tray, không chiếm taskbar, không cướp focus.

---

### Phase 4 — Mascot animation + sound

**Mục tiêu:** Nhận event → mascot chạy ra từ góc, phát sound, hiện text, tự ẩn.

**Files:** `packages/overlay/src/mascot.ts`, `main.ts`, `styles.css`, `assets/`

**Việc cần làm:**
1. Mascot tự vẽ (SVG hoặc sprite sheet). State machine: `hidden → runIn → wave/peek (hold ~3s) → runOut → hidden`.
2. `main.ts`: listen Tauri event `cc-ping-event`.
   - `type=done` → sound `ting`, mascot vui, text "✓ {project} — task done".
   - `type=waiting` → sound nhẹ, mascot vẫy, text "{project} — đang đợi bạn".
   - `type=error` → sound buzz, mascot lo lắng, text "{project} — cần chú ý".
3. Window show khi animate, hide khi xong (gọi Tauri API show/hide để không chiếm màn hình khi idle).
4. Click vào mascot → ẩn ngay. Hover → giữ lại (không tự ẩn) để đọc kịp.
5. Sound: 3 file ngắn trong `assets/sounds/`. Tôn trọng `config.sounds`. Volume hợp lý, có thể tắt qua config.
6. Debounce: nếu nhiều event dồn trong < 2s, gộp lại (không cho mascot giật).

**Acceptance:**
- POST `type=done` → mascot chạy ra, ting, hiện đúng project, tự ẩn sau ~3s.
- Hover giữ lại; click ẩn ngay.
- 3 event liên tiếp không làm animation giật/chồng.

---

### Phase 5 — Nối hook → overlay

**Mục tiêu:** Đóng vòng. Hook POST sang overlay thật.

**Files:** `packages/hook/lib/post-event.mjs`, cập nhật `notify.mjs`

**Việc cần làm:**
1. `post-event.mjs`: POST `/event` tới `127.0.0.1:<port>`.
   - Timeout cực ngắn (vd 300ms). Nếu overlay không sống → **nuốt lỗi**, không retry, không block.
   - Dùng async output của hook (`{"async":true}`) để Claude không phải đợi.
2. `notify.mjs`: sau khi quyết định báo, vừa trả `terminalSequence` (bell) vừa gọi `post-event`. Hai đường độc lập — overlay chết thì vẫn còn bell.
3. Map `hook_event_name` → `type`:
   - `Stop` / `SubagentStop` → `done`.
   - `Notification` → `waiting`.
   - (tương lai) `StopFailure` → `error`.

**Acceptance:**
- Overlay đang chạy + task xong → mascot chạy ra **và** terminal bell.
- Tắt overlay + task xong → chỉ bell, hook vẫn exit 0 nhanh, không treo.
- Đo: hook thêm < ~50ms vào thời gian kết thúc turn.

---

### Phase 6 — Đóng gói, cài đặt, docs

**Mục tiêu:** Người lạ cài được trong vài phút.

**Việc cần làm:**
1. `README.md`: demo GIF lên đầu, "what it does", cài đặt từng OS, gỡ cài.
2. Lệnh cài một dòng:
   - Hook: `npx cc-ping install` (chạy `install.mjs`).
   - Overlay: link tải release đã build sẵn (.msi/.dmg/.AppImage).
3. `npx cc-ping uninstall`: gỡ block hooks khỏi `~/.claude/settings.json` (chỉ gỡ phần của cc-ping, chừa hooks khác của user).
4. `.github/workflows/release.yml`: build overlay 3 OS, attach vào GitHub Release. Publish hook lên npm.
5. Ghi rõ yêu cầu version: **Claude Code ≥ v2.1.141** cho `terminalSequence`. Nếu thấp hơn → chỉ overlay hoạt động (bell phải qua overlay).
6. LICENSE: MIT. Ghi chú mascot là art gốc, không liên kết Anthropic.

**Acceptance:**
- Máy sạch: cài hook + overlay theo README → chạy được.
- `uninstall` trả `settings.json` về trạng thái cũ, không hỏng hooks khác.

---

## 3. Edge cases & rủi ro (xử lý xuyên suốt)

| Vấn đề | Cách xử lý |
|---|---|
| Stop-loop vô hạn | Check `stop_hook_active === true` → exit 0 ngay đầu `notify.mjs`. |
| Hook crash làm gián đoạn Claude | Catch-all → luôn exit 0. Không bao giờ throw, không exit ≠ 0. |
| Overlay chưa chạy | POST timeout 300ms, nuốt lỗi. Bell vẫn chạy độc lập. |
| Spam notification task nhỏ | Threshold `minDurationMs` (Phase 2). |
| Nhiều session song song | Hiện `project` trên mascot để biết session nào xong. Debounce gộp event. |
| Bảo mật cổng local | Overlay chỉ bind `127.0.0.1`, không 0.0.0.0. Không nhận lệnh thực thi, chỉ data hiển thị. |
| terminalSequence không hỗ trợ (version cũ) | Fallback: bell qua overlay; README ghi rõ yêu cầu version. |
| Windows path có dấu `\` | Hook xử lý cwd cross-platform; dùng `path.basename`. |
| `transcript_path` không đọc được | `durationMs = null`, coi như qua threshold, vẫn báo. |

---

## 4. Thứ tự thực thi cho Claude Code

1. Phase 1 → có MVP bell, commit.
2. Phase 2 → threshold + config, commit.
3. Phase 3 → overlay skeleton + server, commit.
4. Phase 4 → mascot + sound, commit.
5. Phase 5 → nối hook↔overlay, commit. **Đây là milestone "ý tưởng hoàn chỉnh".**
6. Phase 6 → đóng gói + docs + release.

Mỗi phase: code → chạy acceptance → commit với message rõ ràng. Không gộp phase. Sau Phase 5 nên quay video/GIF demo cho README ngay (lúc đó tính năng đã đủ ấn tượng để thu hút star).

---

## 5. Để ngỏ cho v2 (không làm bây giờ)

- TTS đọc tên task / tóm tắt việc Claude vừa làm.
- Browser extension cho claude.ai web.
- Nhiều skin mascot, cho cộng đồng đóng góp.
- Thống kê: tổng thời gian các task, số lần "ting" mỗi ngày.
- Tích hợp Slack/Discord webhook (dùng lại HTTP hook type của Claude Code).
