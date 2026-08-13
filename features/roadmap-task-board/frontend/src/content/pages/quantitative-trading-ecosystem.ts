/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 bc5fa2fb5e709cac683af0b64dbac03b38bb4f37f71242d599d5689cd042c6af
 */
export const title = "QUANTITATIVE TRADING ECOSYSTEM";
export const html = `<h1 id="quantitative-trading-ecosystem">QUANTITATIVE TRADING ECOSYSTEM</h1><h2 id="current-state-assessment-acquisition-plan-va-upgrade-architecture-v1">Current-State Assessment, Acquisition Plan và Upgrade Architecture V1</h2><blockquote class="document-note">
<p><strong>Mục đích tài liệu:</strong> mô tả đúng hệ thống đang có, cách các subsystem đang kết nối end-to-end, mức độ trưởng thành của từng core đối với một quant firm, những thành phần cần giữ nguyên khi acquire, và hướng nâng cấp theo từng lớp mà không thực hiện big-bang rewrite.</p>
<p><strong>Nguyên tắc đọc hiện trạng:</strong></p>
<ul>
<li><code>main</code> được xem là release/baseline public ổn định.</li>
<li><code>dev</code> và các feature branch được xem là phần đang phát triển; không mặc định coi là production cho đến khi đối chiếu đúng commit đang chạy.</li>
<li>Phần <code>trading_system</code> dựa trên tài liệu private được cung cấp. Đây là kiến trúc và implementation status do tài liệu mô tả, không phải kết luận từ việc trực tiếp đọc source private.</li>
<li>Các mục “Đề xuất kiến trúc sau upgrade V1” là định hướng mục tiêu, không được hiểu là đã implement.</li>
</ul>
</blockquote><hr class="section-divider"/>`;
