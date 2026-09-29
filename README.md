# Ghi đơn cơm nắm

MVP dùng Expo + React Native, Google Apps Script làm API và Google Sheets lưu đơn. Không cần tài khoản người dùng hay máy chủ riêng. Thời gian ghi nhận được tạo tại Apps Script theo múi giờ `Asia/Ho_Chi_Minh`.

## Kiến trúc và dữ liệu

`App.js` gửi POST JSON tới Apps Script; Apps Script kiểm tra token, số lượng và phương thức thanh toán, sau đó ghi một dòng vào tab `Orders`. Mỗi dòng có cấu trúc:

| Thời gian | Gà | Bò | Phô mai xúc xích | Cá hồi | Cá ngừ | Thanh Cua | Tổng | Thanh toán | Mã đơn | Đơn giá | Thành tiền |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |

Mỗi phần có giá 17.000đ; app hiển thị thành tiền ở phần tổng kết và API ghi cả đơn giá/thành tiền vào Sheet. Mã đơn giữ nguyên khi người dùng thử gửi lại sau lỗi mạng để API có thể bỏ qua đơn trùng. Nút xác nhận bị khóa lúc gửi; form chỉ reset sau khi API trả `ok: true`. Lỗi mạng hoặc lỗi xác thực giữ nguyên lựa chọn.

Trang **Cài đặt** cho nhập tồn đầu kỳ từng loại. Tồn còn lại bằng tồn đầu kỳ trừ số lượng các đơn đã gửi thành công. Tồn kho và số đã bán lưu trên thiết bị bằng Async Storage; phiên bản MVP này phù hợp một thiết bị nhập đơn, chưa đồng bộ tồn giữa nhiều điện thoại.

## Thiết lập Google Sheets và API

1. Tạo Google Sheet mới. Tab `Orders` sẽ được tạo tự động ở lần ghi đầu.
2. Chọn **Extensions > Apps Script**, thay nội dung `Code.gs` bằng file này.
3. Đặt một token ngẫu nhiên dài trong hằng `TOKEN` của `Code.gs`; cấu hình cùng giá trị trong `.env`.
4. Lưu script, chọn **Deploy > New deployment > Web app**. Chọn chạy dưới tài khoản của bạn (**Execute as: Me**) và quyền truy cập phù hợp với người dùng app. Để dùng app không đăng nhập, deployment cần cho phép truy cập ẩn danh; URL và token được nhúng trong app nên token chỉ là rào chắn cơ bản cho MVP, không phải bí mật chống trích xuất.
5. Deploy, cấp quyền cho Apps Script khi Google yêu cầu, rồi sao chép URL kết thúc bằng `/exec`.
6. Sao chép `.env.example` thành `.env`, đặt URL deploy vào `EXPO_PUBLIC_SHEETS_API_URL` và cùng token vào `EXPO_PUBLIC_SHEETS_TOKEN`.

Apps Script Web App cần quyền truy cập công khai để người dùng không phải đăng nhập. Ai có URL và token có thể gửi đơn; chỉ chia sẻ app cho nhóm tin cậy. Nếu đưa app ra công chúng, chuyển token sang xác thực phía server hoặc thêm backend có rate limit.

## Chạy app

Cần Node.js LTS tương thích Expo SDK 57 (tối thiểu Node 22.13.x) và Expo Go trên điện thoại. Trong thư mục này:

```sh
npm install
npx expo install --fix
npm start
```

`@react-native-async-storage/async-storage` dùng để lưu tồn kho trên thiết bị; nếu chưa có trong cây phụ thuộc, cài bằng `npx expo install @react-native-async-storage/async-storage`.

Quét QR bằng Expo Go trên điện thoại cùng mạng. `npx expo install --fix` đồng bộ các phiên bản React Native tương thích với SDK đã cài. Muốn tạo bản cài Android/iOS cho phân phối thì cấu hình EAS Build sau khi xác nhận app hoạt động trên Expo Go.

## Flow màn hình

Màn hình đơn hàng cuộn hiển thị tồn còn lại của từng loại, nút +/- và phương thức thanh toán. Phần dưới cố định hiển thị tổng số phần, đơn giá 17.000đ, thành tiền và nút **Xác nhận đơn**. Trang **Cài đặt** nhập số lượng ban đầu từng loại và tổng số lượng. Khi gửi, app hiển thị loading và khóa thao tác; thành công báo “Đã lưu đơn hàng thành công!”, trừ tồn kho, xóa form và sẵn sàng cho đơn tiếp theo; lỗi giữ dữ liệu để thử lại.
