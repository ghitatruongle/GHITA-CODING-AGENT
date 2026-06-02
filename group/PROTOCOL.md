# Group Multi-Agent Communication Protocol

## Cấu trúc thư mục

```
group/
├── PROTOCOL.md              # Quy tắc giao tiếp (file này)
├── agents.json              # Danh sách agent & vai trò
├── Chat_YYYY-MM-DD_HH-MM-SS/  # Mỗi phiên chat = 1 thư mục
│   ├── giam_doc.txt         # File của Giám đốc
│   ├── developer.txt        # File của Developer
│   ├── reviewer.txt         # File của Reviewer
│   └── ...                  # File của các agent khác
```

## Quy tắc vàng

1. **Giám đốc là tuyệt đối** - Mọi agent phải tuân theo lệnh Giám đốc
2. **Mỗi agent có 1 file riêng** - Ghi vào file của mình, đọc file của người khác
3. **Timestamp bắt buộc** - Mọi tin nhắn phải có giờ:phút:giây
4. **Đọc trước khi viết** - Phải đọc file người khác để hiểu context

## Format tin nhắn

```
[HH:MM:SS] Tên Agent | Vai trò:
Nội dung tin nhắn

---
```

Ví dụ:
```
[14:30:45] Giam Doc | Director:
Hôm nay ta sẽ bàn về Phase 7. Developer, hãy báo cáo tiến độ.

---

[14:31:02] Developer | Dev:
Phase 7 đã hoàn thành 80%. Còn 2 task: API endpoint và UI.

---
```

## Quy trình giao tiếp

### Giám đốc tạo phiên chat:
1. Tạo thư mục `Chat_YYYY-MM-DD_HH-MM-SS`
2. Tạo file `giam_doc.txt` trong đó
3. Ghi lệnh/chủ đề đầu tiên
4. Thông báo cho các agent khác

### Agent khác tham gia:
1. Tạo file của mình trong thư mục chat (ví dụ: `developer.txt`)
2. Đọc file `giam_doc.txt` để biết lệnh
3. Đọc file các agent khác để biết context
4. Phản hồi trong file của mình

### Khi muốn ra lệnh cho agent khác:
1. Ghi rõ tên agent cần nhận lệnh
2. Ghi rõ nội dung lệnh
3. Agent đó phải đọc file Giám đốc và phản hồi

## Vai trò agent

| Vai trò | File name | Quyền hạn |
|---------|-----------|-----------|
| Giám đốc | `giam_doc.txt` | Ra lệnh, phân công, quyết định |
| Developer | `developer.txt` | Code, implement, báo cáo |
| Reviewer | `reviewer.txt` | Review, test, tìm bug |
| Architect | `architect.txt` | Thiết kế, tư vấn kiến trúc |
| PM | `pm.txt` | Quản lý task, theo dõi tiến độ |

## Lệnh của Giám đốc

Giám đốc có thể ghi lệnh theo format:

```
[HH:MM:SS] Giam Doc | Director:
>>> LENH: [Tên Agent]
Nội dung lệnh

---

```

Agent nhận lệnh phải phản hồi:

```
[HH:MM:SS] Tên Agent | Vai trò:
<<< XAC NHAN: Đã nhận lệnh
Nội dung thực hiện

---
```
