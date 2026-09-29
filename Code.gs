// Google Apps Script - gắn với Google Sheet bằng Extensions > Apps Script.
const SHEET_NAME = "Orders";
const TOKEN = "my_secret_token_123456";
const TZ = "Asia/Ho_Chi_Minh";
const ITEMS = ["ga", "bo", "phomai", "cahoi", "cangu", "thanhcua"];
const PAYMENTS = ["Tiền mặt", "Chuyển khoản"];
const UNIT_PRICE = 17000;
const HEADERS = [
  "Thời gian",
  "Gà",
  "Bò",
  "Phô mai xúc xích",
  "Cá hồi",
  "Cá ngừ",
  "Thanh Cua",
  "Tổng",
  "Thanh toán",
  "Mã đơn",
  "Đơn giá",
  "Thành tiền",
];

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doGet() {
  return out({ ok: true, service: "comnam-orders" });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse((e.postData && e.postData.contents) || "{}");
    if (data.token !== TOKEN)
      return out({ ok: false, error: "Mã kết nối không hợp lệ." });
    if (!PAYMENTS.includes(data.payment))
      return out({ ok: false, error: "Vui lòng chọn phương thức thanh toán." });

    const items = data.items || {};
    const qty = ITEMS.map((key) => items[key]);
    if (qty.some((n) => !Number.isInteger(n) || n < 0)) {
      return out({ ok: false, error: "Số lượng không hợp lệ." });
    }
    const total = qty.reduce((sum, n) => sum + n, 0);
    if (total < 1) return out({ ok: false, error: "Chưa chọn cơm nắm." });
    if (
      typeof data.orderId !== "string" ||
      !/^[a-z0-9-]{8,80}$/i.test(data.orderId)
    ) {
      return out({ ok: false, error: "Mã đơn không hợp lệ." });
    }
    if (data.unitPrice !== UNIT_PRICE)
      return out({ ok: false, error: "Đơn giá không hợp lệ." });

    lock.waitLock(10000);
    const sheet =
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME) ||
      SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < HEADERS.length) {
      sheet.getRange(1, 11, 1, 2).setValues([HEADERS.slice(10)]);
    }

    // Mã đơn lưu trong cột J giúp request gửi lại không tạo thêm dòng trùng.
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const match = sheet
        .getRange(2, 10, lastRow - 1, 1)
        .createTextFinder(data.orderId)
        .matchEntireCell(true)
        .findNext();
      if (match) return out({ ok: true, duplicate: true });
    }

    const time = Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm");
    sheet.appendRow([
      time,
      ...qty,
      total,
      data.payment,
      data.orderId,
      UNIT_PRICE,
      total * UNIT_PRICE,
    ]);
    return out({ ok: true });
  } catch (err) {
    return out({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}
