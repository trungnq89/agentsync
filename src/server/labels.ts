export const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: 'Chờ xác nhận',
  changes_requested: 'Cần sửa plan',
  in_progress: 'Đang làm',
  paused: 'Tạm dừng',
  done: 'Xong',
  awaiting_review: 'Xong, chờ review',
  closed: 'Đã đóng',
  cancelled: 'Đã hủy',
};

export const MODE_LABEL: Record<string, string> = {
  executive: 'Quản lý cấp cao',
  project: 'Dự án',
};

export const HEALTH_LABEL: Record<string, string> = {
  on_track: 'Đúng hạn',
  at_risk: 'Có rủi ro',
  blocked: 'Đang kẹt',
};

export const LEVEL_LABEL: Record<string, string> = {
  director: 'Director',
  manager: 'Manager',
  leader: 'Leader',
  member: 'Thành viên',
};

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
export const modeLabel = (s: string) => MODE_LABEL[s] ?? s;
export const healthLabel = (s: string) => HEALTH_LABEL[s] ?? s;
export const levelLabel = (s: string) => LEVEL_LABEL[s] ?? s;

export const SEND_MODE_LABEL: Record<string, string> = {
  auto: 'Tự động',
  review: 'Duyệt trước khi gửi',
};

export const VERDICT_LABEL: Record<string, string> = {
  approved: 'Đã review, ổn',
  changes_needed: 'Cần sửa',
};

export const sendModeLabel = (s: string) => SEND_MODE_LABEL[s] ?? s;
export const verdictLabel = (s: string) => VERDICT_LABEL[s] ?? s;

export const ATTENTION_KIND_LABEL: Record<string, string> = {
  pending_confirmation: 'Chờ xác nhận',
  awaiting_review: 'Chờ review',
  blocked: 'Đang kẹt',
  overdue: 'Trễ hạn',
  stale: 'Lâu không cập nhật',
  paused_or_cancelled: 'Tạm dừng/Hủy',
  changes_requested: 'Cần sửa plan',
  question_for_me: 'Câu hỏi cho bạn',
};

export const attentionKindLabel = (s: string) => ATTENTION_KIND_LABEL[s] ?? s;
