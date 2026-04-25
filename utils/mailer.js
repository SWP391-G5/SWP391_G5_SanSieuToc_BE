const nodemailer = require('nodemailer');

let cachedTransporter;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

function renderEmailShell({
  title,
  subtitle,
  accent = '#6dff9e',
  headerBg = '#0d6100',
  preheader,
  contentHtml,
  footerText,
}) {
  const safeTitle = escapeHtml(title || 'Sân Siêu Tốc');
  const safeSubtitle = escapeHtml(subtitle || '');
  const safePreheader = escapeHtml(preheader || '');
  const safeFooterText = escapeHtml(footerText || 'Trân trọng, Sân Siêu Tốc');

  // Table-based layout for better compatibility (especially Outlook)
  return `
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${safePreheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:#ffffff; border-radius:10px; overflow:hidden; font-family:Arial, sans-serif;">
          <tr>
            <td style="background:${headerBg}; padding:18px 20px; text-align:center;">
              <div style="font-size:22px; line-height:28px; font-weight:700; color:#ffffff;">${safeTitle}</div>
              ${safeSubtitle ? `<div style="margin-top:6px; font-size:14px; line-height:18px; color:#ffffff; opacity:0.95;">${safeSubtitle}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px;">
              ${contentHtml || ''}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 20px; border-top:1px solid #e9e9e9; color:#666; font-size:12px; line-height:16px;">
              ${safeFooterText}
              <div style="margin-top:8px; color:${accent};">&nbsp;</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}

function renderInfoCard({ title, accent = '#6dff9e', rows = [] }) {
  const safeTitle = escapeHtml(title || 'Thông tin');
  const renderedRows = rows
    .filter((r) => r && (r.label || r.value))
    .map(({ label, value, valueStyle }) => {
      const safeLabel = escapeHtml(label || '');
      const safeValue = escapeHtml(value ?? '');
      const extra = valueStyle ? ` ${valueStyle}` : '';
      return `
        <tr>
          <td style="padding:6px 0; color:#333; font-size:14px; width:160px; vertical-align:top;"><strong>${safeLabel}</strong></td>
          <td style="padding:6px 0; color:#333; font-size:14px; vertical-align:top;${extra}">${safeValue}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #ececec; border-left:4px solid ${accent}; border-radius:10px; padding:0; margin:14px 0 0;">
      <tr>
        <td style="padding:14px 14px 12px;">
          <div style="font-size:16px; font-weight:700; color:#333; margin:0 0 8px;">${safeTitle}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${renderedRows}
          </table>
        </td>
      </tr>
    </table>
  `;
}

const isEmailConfigured = () => {
  const emailUser = String(process.env.EMAIL_USER || '').trim();
  const emailPassword = String(process.env.EMAIL_PASSWORD || '').trim();

  // Only validate presence + basic email shape.
  // Do NOT block passwords that contain spaces (Gmail App Password often contains spaces).
  return Boolean(emailUser && emailPassword && emailUser.includes('@'));
};

/**
 * Create email transporter
 * Note: You need to install nodemailer first: npm install nodemailer
 * Then add to .env file:
 * EMAIL_USER=your-email@gmail.com
 * EMAIL_PASSWORD=your-app-password (for Gmail, use App Password, not regular password)
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // TLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
};

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!isEmailConfigured()) {
    const err = new Error('Email is not configured (EMAIL_USER/EMAIL_PASSWORD)');
    err.status = 500;
    throw err;
  }
  cachedTransporter = createTransporter();
  return cachedTransporter;
}

async function sendNewPasswordEmail({ to, name, newPassword }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Mật khẩu mới';
  const safeName = name || 'bạn';

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Hệ thống đã tạo mật khẩu mới cho tài khoản của bạn:',
    `${newPassword}`,
    '',
    'Vui lòng đăng nhập và đổi mật khẩu ngay sau khi đăng nhập.',
  ].join('\n');

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
  });
}

async function sendVerificationCodeEmail({ to, name, code }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Mã xác thực tài khoản';
  const safeName = name || 'bạn';

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Mã xác thực tài khoản của bạn là:',
    `${code}`,
    '',
    'Mã này có hiệu lực trong 5 phút.',
  ].join('\n');

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
  });
}

async function sendAccountCredentialsEmail({ to, name, username, password, role }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Tài khoản của bạn';
  const safeName = name || 'bạn';
  const roleKey = String(role || '').trim();
  const safeRole =
    roleKey === 'Admin'
      ? 'Quản trị viên'
      : roleKey === 'Manager'
        ? 'Quản lý'
        : roleKey === 'Owner'
          ? 'Chủ sân'
          : roleKey === 'Customer'
            ? 'Khách hàng'
            : roleKey || 'người dùng';
  const text = [
    `Xin chào ${safeName},`,
    '',
    `Hệ thống đã tạo tài khoản ${safeRole} cho bạn:`,
    `Tên đăng nhập: ${username}`,
    `Mật khẩu: ${password}`,
    '',
    'Vui lòng đăng nhập và đổi mật khẩu ngay sau khi đăng nhập.',
  ].join('\n');

  const html = renderEmailShell({
    title: 'Sân Siêu Tốc',
    subtitle: 'Thông tin tài khoản',
    headerBg: '#0d6100',
    accent: '#6dff9e',
    preheader: `Tài khoản ${safeRole} đã được tạo cho bạn`,
    contentHtml: `
      <div style="color:#333; font-size:14px; line-height:20px;">Xin chào <strong>${escapeHtml(safeName)}</strong>,</div>
      <div style="margin-top:8px; color:#333; font-size:14px; line-height:20px;">Hệ thống đã tạo tài khoản <strong>${escapeHtml(safeRole)}</strong> cho bạn. Vui lòng sử dụng thông tin bên dưới để đăng nhập.</div>
      ${renderInfoCard({
        title: 'Thông tin đăng nhập',
        accent: '#6dff9e',
        rows: [
          { label: 'Vai trò', value: safeRole },
          { label: 'Tên đăng nhập', value: username },
          {
            label: 'Mật khẩu',
            value: password,
            valueStyle:
              'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#f7f7f7; padding:2px 6px; border-radius:6px;',
          },
        ],
      })}
      <div style="margin-top:14px; color:#666; font-size:13px; line-height:18px;">Vì lý do bảo mật, hãy đổi mật khẩu ngay sau khi đăng nhập.</div>
    `,
    footerText: 'Email này được gửi tự động. Nếu bạn không yêu cầu tạo tài khoản, vui lòng liên hệ quản trị viên.',
  });

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

async function sendBookingConfirmationEmail({ to, name, bookingDetails }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Xác nhận đặt sân thành công';
  const safeName = name || 'bạn';
  const { fieldName, date, time, total, bookingId } = bookingDetails;

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Đơn đặt sân của bạn đã được xác nhận thành công!',
    '',
    '--- Thông tin đặt sân ---',
    `Mã đặt sân: ${bookingId}`,
    `Sân: ${fieldName}`,
    `Ngày: ${date}`,
    `Giờ: ${time}`,
    `Tổng tiền: ${total} VND`,
    '',
    'Cảm ơn bạn đã sử dụng dịch vụ Sân Siêu Tốc!',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6dff9e, #2ff801); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #0d6100; margin: 0;">Sân Siêu Tốc</h1>
        <p style="color: #0d6100; margin: 5px 0 0;">Đặt sân thành công!</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chào <strong>${safeName}</strong>,</p>
        <p>Đơn đặt sân của bạn đã được xác nhận thành công!</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #6dff9e;">
          <h3 style="margin: 0 0 10px; color: #333;">Thông tin đặt sân</h3>
          <p style="margin: 5px 0;"><strong>Mã đặt sân:</strong> ${bookingId}</p>
          <p style="margin: 5px 0;"><strong>Sân:</strong> ${fieldName}</p>
          <p style="margin: 5px 0;"><strong>Ngày:</strong> ${date}</p>
          <p style="margin: 5px 0;"><strong>Giờ:</strong> ${time}</p>
          <p style="margin: 5px 0;"><strong>Tổng tiền:</strong> <span style="color: #6dff9e; font-weight: bold;">${total} VND</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">Cảm ơn bạn đã sử dụng dịch vụ Sân Siêu Tốc!</p>
      </div>
    </div>
  `;

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

async function sendBookingCancellationEmail({ to, name, bookingDetails }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Yêu cầu hủy đặt sân';
  const safeName = name || 'bạn';
  const { fieldName, date, time, total, bookingId, status } = bookingDetails;

  const text = [
    `Xin chào ${safeName},`,
    '',
    `Yêu cầu hủy đặt sân của bạn đã được tiến hành. Dưới đây là thông tin chi tiết về yêu cầu hủy:`,
    '',
    '--- Thông tin đặt sân ---',
    `Mã đặt sân: ${bookingId}`,
    `Sân: ${fieldName}`,
    `Ngày: ${date}`,
    `Giờ: ${time}`,
    `Tổng tiền: ${total} VND`,
    `Trạng thái: ${status}`,
    '',
    status === 'Đang chờ hoàn tiền'
      ? 'Vui lòng chờ Chủ sân xác nhận hoàn tiền. Tiền sẽ được hoàn lại vào ví sau khi xác nhận.'
      : 'Tiền đã được hoàn vào ví của bạn.',
    '',
    'Nếu có thắc mắc, vui lòng liên hệ với chúng tôi.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #ffc864, #ff9632); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #fff; margin: 0;">Sân Siêu Tốc</h1>
        <p style="color: #fff; margin: 5px 0 0;">Yêu cầu hủy đặt sân</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chào <strong>${safeName}</strong>,</p>
        <p> Yêu cầu hủy đặt sân của bạn đã được tiến hành. Dưới đây là thông tin chi tiết về yêu cầu hủy:</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc864;">
          <h3 style="margin: 0 0 10px; color: #333;">Thông tin đặt sân</h3>
          <p style="margin: 5px 0;"><strong>Mã đặt sân:</strong> ${bookingId}</p>
          <p style="margin: 5px 0;"><strong>Sân:</strong> ${fieldName}</p>
          <p style="margin: 5px 0;"><strong>Ngày:</strong> ${date}</p>
          <p style="margin: 5px 0;"><strong>Giờ:</strong> ${time}</p>
          <p style="margin: 5px 0;"><strong>Tổng tiền:</strong> ${total} VND</p>
          <p style="margin: 5px 0;"><strong>Trạng thái:</strong> <span style="color: #ff9632; font-weight: bold;">${status}</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">
          ${status === 'Đang chờ hoàn tiền'
      ? 'Vui lòng chờ Chủ sân xác nhận hoàn tiền. Tiền sẽ được hoàn lại vào ví sau khi xác nhận.'
      : 'Tiền đã được hoàn vào ví của bạn.'}
        </p>
        <p style="color: #666; font-size: 14px;">Nếu có thắc mắc, vui lòng liên hệ với chúng tôi.</p>
      </div>
    </div>
  `;

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

async function sendWalletTopupEmail({ to, name, amount, balance, transactionId }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Nạp tiền ví thành công';
  const safeName = name || 'bạn';

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Tài khoản ví của bạn đã được nạp tiền thành công!',
    '',
    '--- Chi tiết giao dịch ---',
    `Mã giao dịch: ${transactionId || 'N/A'}`,
    `Số tiền nạp: +${amount} VND`,
    `Số dư hiện tại: ${balance} VND`,
    '',
    'Bạn có thể sử dụng số dư này để đặt sân.',
    '',
    'Cảm ơn bạn đã sử dụng dịch vụ Sân Siêu Tốc!',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6dff9e, #2ff801); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #0d6100; margin: 0;">Sân Siêu Tốc</h1>
        <p style="color: #0d6100; margin: 5px 0 0;">Nạp tiền ví thành công!</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chào <strong>${safeName}</strong>,</p>
        <p>Tài khoản ví của bạn đã được nạp tiền thành công!</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #6dff9e;">
          <h3 style="margin: 0 0 10px; color: #333;">Chi tiết giao dịch</h3>
          <p style="margin: 5px 0;"><strong>Mã giao dịch:</strong> ${transactionId || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>Số tiền nạp:</strong> <span style="color: #6dff9e; font-weight: bold;">+${amount} VND</span></p>
          <p style="margin: 5px 0;"><strong>Số dư hiện tại:</strong> <span style="font-weight: bold;">${balance} VND</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">Bạn có thể sử dụng số dư này để đặt sân.</p>
        <p style="color: #666; font-size: 14px;">Cảm ơn bạn đã sử dụng dịch vụ Sân Siêu Tốc!</p>
      </div>
    </div>
  `;

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

async function sendWalletRefundEmail({ to, name, amount, balance, bookingId, reason }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Hoàn tiền ví thành công';
  const safeName = name || 'bạn';

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Tiền hoàn từ hủy đặt sân đã được chuyển vào ví của bạn!',
    '',
    '--- Chi tiết hoàn tiền ---',
    `Mã đặt sân: ${bookingId}`,
    `Lý do: ${reason || 'Hủy đặt sân'}`,
    `Số tiền hoàn: +${amount} VND`,
    `Số dư hiện tại: ${balance} VND`,
    '',
    'Bạn có thể sử dụng số dư này để đặt sân khác.',
    '',
    'Cảm ơn bạn đã sử dụng dịch vụ Sân Siêu Tốc!',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6dff9e, #2ff801); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #0d6100; margin: 0;">Sân Siêu Tốc</h1>
        <p style="color: #0d6100; margin: 5px 0 0;">Hoàn tiền thành công!</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chào <strong>${safeName}</strong>,</p>
        <p>Tiền hoàn từ hủy đặt sân đã được chuyển vào ví của bạn!</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #6dff9e;">
          <h3 style="margin: 0 0 10px; color: #333;">Chi tiết hoàn tiền</h3>
          <p style="margin: 5px 0;"><strong>Mã đặt sân:</strong> ${bookingId}</p>
          <p style="margin: 5px 0;"><strong>Lý do:</strong> ${reason || 'Hủy đặt sân'}</p>
          <p style="margin: 5px 0;"><strong>Số tiền hoàn:</strong> <span style="color: #6dff9e; font-weight: bold;">+${amount} VND</span></p>
          <p style="margin: 5px 0;"><strong>Số dư hiện tại:</strong> <span style="font-weight: bold;">${balance} VND</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">Bạn có thể sử dụng số dư này để đặt sân khác.</p>
        <p style="color: #666; font-size: 14px;">Cảm ơn bạn đã sử dụng dịch vụ Sân Siêu Tốc!</p>
      </div>
    </div>
  `;

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

function formatVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(Number(amount || 0));
}

async function sendManagerDeletionNoticeEmail({ to, name, scheduledAt, adminEmail }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Thông báo xóa tài khoản Quản lý';
  const safeName = name || 'bạn';
  const safeAdminEmail = adminEmail || user;
  const safeDate = scheduledAt instanceof Date ? scheduledAt.toLocaleString('vi-VN') : String(scheduledAt || '');

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Hệ thống nhận được yêu cầu xóa tài khoản Quản lý của bạn.',
    'Bạn có 3 ngày để rút hết số dư trong ví (nếu có) trước khi tài khoản bị xóa.',
    '',
    `Thời gian dự kiến xóa tài khoản: ${safeDate}`,
    '',
    `Nếu bạn có thắc mắc, vui lòng liên hệ Quản trị viên qua email: ${safeAdminEmail}`,
    '',
    'Trân trọng,',
    'Sân Siêu Tốc',
  ].join('\n');

  const html = renderEmailShell({
    title: 'Sân Siêu Tốc',
    subtitle: 'Thông báo xóa tài khoản Quản lý',
    headerBg: '#ff9632',
    accent: '#ff9632',
    preheader: `Tài khoản Quản lý sẽ bị xóa vào ${safeDate}`,
    contentHtml: `
      <div style="color:#333; font-size:14px; line-height:20px;">Xin chào <strong>${escapeHtml(safeName)}</strong>,</div>
      <div style="margin-top:8px; color:#333; font-size:14px; line-height:20px;">Hệ thống nhận được yêu cầu xóa tài khoản <strong>Quản lý</strong> của bạn.</div>
      <div style="margin-top:8px; color:#333; font-size:14px; line-height:20px;">Bạn có <strong>3 ngày</strong> để rút hết số dư trong ví (nếu có) trước khi tài khoản bị xóa.</div>
      ${renderInfoCard({
        title: 'Chi tiết',
        accent: '#ff9632',
        rows: [
          { label: 'Thời gian dự kiến xóa', value: safeDate },
          { label: 'Liên hệ quản trị viên', value: safeAdminEmail },
        ],
      })}
      <div style="margin-top:14px; color:#666; font-size:13px; line-height:18px;">Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ quản trị viên để được hỗ trợ.</div>
    `,
    footerText: 'Trân trọng, Sân Siêu Tốc',
  });

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

async function sendOwnerDeletionScheduledEmail({ to, name, scheduledAt, adminEmail }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Thông báo xóa tài khoản Chủ sân';
  const safeName = name || 'bạn';
  const safeAdminEmail = adminEmail || user;
  const safeDate = scheduledAt instanceof Date ? scheduledAt.toLocaleString('vi-VN') : String(scheduledAt || '');

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Hệ thống nhận được yêu cầu xóa tài khoản Chủ sân của bạn.',
    'Bạn có 3 ngày để rút hết số dư trong ví (nếu có) trước khi tài khoản bị xóa.',
    '',
    `Thời gian dự kiến xóa tài khoản: ${safeDate}`,
    '',
    `Nếu bạn cần hỗ trợ, vui lòng liên hệ Quản trị viên qua email: ${safeAdminEmail}`,
    '',
    'Trân trọng,',
    'Sân Siêu Tốc',
  ].join('\n');

  const html = renderEmailShell({
    title: 'Sân Siêu Tốc',
    subtitle: 'Thông báo xóa tài khoản Chủ sân',
    headerBg: '#ff9632',
    accent: '#ff9632',
    preheader: `Tài khoản Chủ sân sẽ bị xóa vào ${safeDate}`,
    contentHtml: `
      <div style="color:#333; font-size:14px; line-height:20px;">Xin chào <strong>${escapeHtml(safeName)}</strong>,</div>
      <div style="margin-top:8px; color:#333; font-size:14px; line-height:20px;">Hệ thống nhận được yêu cầu xóa tài khoản <strong>Chủ sân</strong> của bạn.</div>
      <div style="margin-top:8px; color:#333; font-size:14px; line-height:20px;">Bạn có <strong>3 ngày</strong> để rút hết số dư trong ví (nếu có) trước khi tài khoản bị xóa.</div>
      ${renderInfoCard({
        title: 'Chi tiết',
        accent: '#ff9632',
        rows: [
          { label: 'Thời gian dự kiến xóa', value: safeDate },
          { label: 'Liên hệ quản trị viên', value: safeAdminEmail },
        ],
      })}
      <div style="margin-top:14px; color:#666; font-size:13px; line-height:18px;">Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ quản trị viên để được hỗ trợ.</div>
    `,
    footerText: 'Trân trọng, Sân Siêu Tốc',
  });

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

async function sendFeedbackDeletionNoticeEmail({ to, name, fieldName, feedbackContent, reason }) {
  const user = process.env.EMAIL_USER;
  const subject = 'Sân Siêu Tốc - Thông báo Feedback vi phạm';
  const safeName = name || 'bạn';
  const safeFieldName = fieldName || 'sân';
  const safeReason = reason || 'Vi phạm quy định cộng đồng.';
  const safeContent = String(feedbackContent || '').trim();

  const text = [
    `Xin chào ${safeName},`,
    '',
    'Feedback của bạn đã bị xóa do vi phạm quy định cộng đồng.',
    '',
    `Sân: ${safeFieldName}`,
    safeContent ? `Nội dung feedback: ${safeContent}` : null,
    `Lý do: ${safeReason}`,
    '',
    'Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ quản trị viên để được hỗ trợ.',
    '',
    'Trân trọng,',
    'Sân Siêu Tốc',
  ]
    .filter(Boolean)
    .join('\n');

  // HTML theme: reuse the layout style of booking confirmation email
  // (gradient header + light container + left border card)
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #ffb86b, #ff4d4d); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #5a0b0b; margin: 0;">Sân Siêu Tốc</h1>
        <p style="color: #5a0b0b; margin: 5px 0 0;">Thông báo Feedback vi phạm</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chào <strong>${safeName}</strong>,</p>
        <p>Feedback của bạn đã bị xóa do vi phạm quy định cộng đồng.</p>

        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ff4d4d;">
          <h3 style="margin: 0 0 10px; color: #333;">Chi tiết</h3>
          <p style="margin: 5px 0;"><strong>Sân:</strong> ${safeFieldName}</p>
          ${safeContent ? `<p style="margin: 5px 0;"><strong>Nội dung feedback:</strong> ${safeContent}</p>` : ''}
          <p style="margin: 5px 0;"><strong>Lý do:</strong> <span style="color: #ff4d4d; font-weight: bold;">${safeReason}</span></p>
        </div>

        <p style="color: #666; font-size: 14px;">Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ quản trị viên để được hỗ trợ.</p>
        <p style="color: #666; font-size: 14px; margin-top: 14px;">Trân trọng,<br/>Sân Siêu Tốc</p>
      </div>
    </div>
  `;

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  isEmailConfigured,
  createTransporter,
  sendNewPasswordEmail,
  sendAccountCredentialsEmail,
  sendVerificationCodeEmail,
  sendBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendWalletTopupEmail,
  sendWalletRefundEmail,
  sendManagerDeletionNoticeEmail,
  sendOwnerDeletionScheduledEmail,
  sendFeedbackDeletionNoticeEmail,
};
