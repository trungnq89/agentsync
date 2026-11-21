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
