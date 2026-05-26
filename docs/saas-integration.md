# Hướng Dẫn Tích Hợp Ứng Dụng SaaS Mới Vào GHITA

GHITA sử dụng cổng kết nối **Composio SaaS Integration** tập trung để nạp, đồng bộ credentials OAuth và điều phối các tác vụ bên thứ ba (Slack, GitHub, Jira, v.v.). Dưới đây là các bước để tích hợp thêm một ứng dụng SaaS mới vào registry của GHITA.

---

## 🛠️ Quy Trình Tích Hợp Hệ Thống (3 Bước)

### Bước 1: Khai báo Định danh (App ID) & Credentials
Mọi kết nối ứng dụng SaaS mới bắt buộc phải được đồng bộ vào `ComposioSkillAdapter` thông qua giao thức nạp credentials tập trung:

```typescript
import { ComposioSkillAdapter } from '@ghita/skills';

const adapter = new ComposioSkillAdapter();

// Nạp credentials tập trung (ví dụ tích hợp Trello)
adapter.setCredential({
  appId: 'trello',
  accessToken: 'user_oauth_access_token_here',
  refreshToken: 'user_oauth_refresh_token_here',
  expiresAt: Date.now() + 3600 * 1000 // Thời gian hết hạn
});
```

### Bước 2: Bổ sung Action Mappings tương thích
Để ánh xạ các actions mới từ ứng dụng của bạn, hãy cập nhật hàm `simulateAction` trong `packages/skills/src/registry/composioAdapter.ts` (hoặc cấu hình thông qua cổng thực tế của Composio Core SDK):

```typescript
case 'trello':
  if (actionLower === 'create_card') {
    return {
      card_id: `card_${Math.random().toString(36).slice(2, 10)}`,
      name: params.name || 'Task Card',
      board_id: params.board_id || 'board_01',
    };
  }
  break;
```

### Bước 3: Đăng ký Skill chạy tương ứng
Sau khi khai báo adapter, đăng ký mã lệnh/tác vụ chạy tương ứng thông qua Registry chính của GHITA. Agent sẽ tự động nạp công cụ và gọi `executeSaaSAction`:

```typescript
const response = await adapter.executeSaaSAction('trello.create_card', {
  name: 'Lập trình tính năng Tuần 6',
  board_id: 'ghita_roadmap'
});

if (response.success) {
  console.log('Tạo card thành công:', response.data.card_id);
} else {
  console.error('Lỗi tích hợp:', response.error);
}
```

---

## ⚠️ Cơ Chế Bảo Mật & Ổn Định

### 1. Tự Động Làm Mới Token (OAuth Auto-Refresher Interceptor)
Adapter sẽ chặn trước mọi cuộc gọi API và tự động gửi chỉ thị làm mới token OAuth nếu phát hiện thời gian hết hạn (`expiresAt`) sắp diễn ra trong vòng 5 phút. Điều này đảm bảo các tác vụ chạy ngầm lâu dài không bao giờ bị gián đoạn.

### 2. Tự Động Cô Lập Công Cụ Lỗi (Faulty Tools Auto-Isolation)
Nếu một ứng dụng SaaS liên tục gặp lỗi mạng hoặc API bị từ chối 3 lần liên tiếp, hệ thống sẽ tự động đưa ứng dụng đó vào trạng thái **Cô lập (Isolated)** để tránh làm treo các tác vụ điều phối chung của Agent. Bạn có thể giải phóng cô lập bằng lệnh:
`adapter.releaseIsolation('trello')`.
