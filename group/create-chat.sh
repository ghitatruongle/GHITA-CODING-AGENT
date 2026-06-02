#!/bin/bash
# Tạo phiên chat mới với timestamp
# Usage: ./create-chat.sh

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
CHAT_DIR="Chat_${TIMESTAMP}"

mkdir -p "$CHAT_DIR"

# Tạo file mẫu cho Giám đốc
cat > "${CHAT_DIR}/giam_doc.txt" << EOF
============================================================
PHIÊN CHAT: ${CHAT_DIR}
============================================================

[14:00:00] Giam Doc | Director:
Phiên chat mới đã được tạo. Các agent tham gia vui lòng:
1. Tạo file riêng của mình trong thư mục này
2. Đọc file giam_doc.txt để biết chủ đề
3. Phản hồi trong file của mình

---

EOF

echo "Đã tạo phiên chat: ${CHAT_DIR}"
echo "Các agent hãy vào thư mục này và tạo file riêng"
echo ""
echo "Cấu trúc:"
echo "  ${CHAT_DIR}/"
echo "  ├── giam_doc.txt      (Giám đốc)"
echo "  ├── developer.txt     (Developer - tự tạo)"
echo "  ├── reviewer.txt      (Reviewer - tự tạo)"
echo "  └── ..."
