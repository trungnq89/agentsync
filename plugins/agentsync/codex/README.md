# AgentSync cho Codex

Bộ skill dùng chung định dạng `SKILL.md` với Claude Code. Cấu hình MCP làm riêng cho Codex như dưới đây.

## 1. Cài skill

Tài liệu Codex hiện hành (learn.chatgpt.com/docs/build-skills, trước đây developers.openai.com/codex/skills) ghi vị trí skill cấp người dùng là `$HOME/.agents/skills`, và cấp repo là `$REPO_ROOT/.agents/skills`. Tài liệu đó không nhắc `~/.codex/skills`.

```bash
mkdir -p ~/.agents/skills
cp -R plugins/agentsync/skills/* ~/.agents/skills/
```

Nếu phiên bản Codex của bạn vẫn đọc `~/.codex/skills/` (các bản cũ), copy thêm vào đó:

```bash
mkdir -p ~/.codex/skills
cp -R plugins/agentsync/skills/* ~/.codex/skills/
```

Chưa kiểm chứng: việc `~/.codex/skills` còn được đọc ở bản Codex mới hay không. Hãy kiểm tra bằng cách khởi động Codex lại rồi xem danh sách skill.

## 2. Thêm MCP server

Lấy token ở trang Cài đặt của AgentSync, rồi đặt biến môi trường (thêm vào `~/.zshrc` hoặc tương đương):

```bash
export AGENTSYNC_TOKEN="ags_..."
```

### Cách A: `~/.codex/config.toml` (khuyến nghị, có bearer token)

```toml
[mcp_servers.agentsync]
url = "https://agentsync.example.com/api/mcp"
bearer_token_env_var = "AGENTSYNC_TOKEN"
```

Đổi `url` thành địa chỉ AgentSync của bạn. Codex đọc token từ biến môi trường và gửi trong header `Authorization: Bearer ...`.

### Cách B: `codex mcp add`

```bash
codex mcp add agentsync --url https://agentsync.example.com/api/mcp
```

Theo tài liệu, lệnh này chỉ có cờ `--url` (và các cờ OAuth). Tài liệu không ghi cờ cho bearer token, nên sau khi chạy lệnh, mở `~/.codex/config.toml` và thêm dòng `bearer_token_env_var = "AGENTSYNC_TOKEN"` vào mục `[mcp_servers.agentsync]`.

## Chưa kiểm tra

Cú pháp trên đối chiếu với tài liệu Codex tại thời điểm viết (các khóa `url`, `bearer_token_env_var`, `http_headers`, cờ `--url`). Chưa chạy thử trực tiếp với Codex trong môi trường phát triển.
