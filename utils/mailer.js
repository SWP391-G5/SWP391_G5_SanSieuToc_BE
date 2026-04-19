const nodemailer = require('nodemailer');

let cachedTransporter;

const isEmailConfigured = () => {
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  return Boolean(
    emailUser &&
    emailPassword &&
    emailUser !== 'your-email@gmail.com' &&
    emailPassword !== 'your-app-password' &&
    emailUser.includes('@')
  );
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
  const subject = 'San Sieu Toc - Mat khau moi';
  const safeName = name || 'ban';

  const text = [
    `Xin chao ${safeName},`,
    '',
    'He thong da tao mat khau moi cho tai khoan cua ban:',
    `${newPassword}`,
    '',
    'Vui long dang nhap va doi mat khau ngay sau khi dang nhap.',
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
  const subject = 'San Sieu Toc - Ma xac thuc tai khoan';
  const safeName = name || 'ban';

  const text = [
    `Xin chao ${safeName},`,
    '',
    'Ma xac thuc tai khoan cua ban la:',
    `${code}`,
    '',
    'Ma nay co hieu luc trong 5 phut.',
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
  const subject = 'San Sieu Toc - Tai khoan cua ban';
  const safeName = name || 'ban';
  const safeRole = role || 'nguoi dung';
  const text = [
    `Xin chao ${safeName},`,
    '',
    `He thong da tao tai khoan ${safeRole} cho ban:`,
    `Username: ${username}`,
    `Password: ${password}`,
    '',
    'Vui long dang nhap va doi mat khau ngay sau khi dang nhap.',
  ].join('\n');

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
  });
}

async function sendBookingConfirmationEmail({ to, name, bookingDetails }) {
  const user = process.env.EMAIL_USER;
  const subject = 'San Sieu Toc - Xac nhan dat san thanh cong';
  const safeName = name || 'ban';
  const { fieldName, date, time, total, bookingId } = bookingDetails;

  const text = [
    `Xin chao ${safeName},`,
    '',
    'Đơn đặt sân của bạn đã được xác nhận thành công!',
    '',
    '--- Thong tin dat san ---',
    `Ma dat san: ${bookingId}`,
    `San: ${fieldName}`,
    `Ngay: ${date}`,
    `Gio: ${time}`,
    `Tong tien: ${total} VND`,
    '',
    'Cam on ban da su dung dich vu San Sieu Toc!',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6dff9e, #2ff801); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #0d6100; margin: 0;">San Sieu Toc</h1>
        <p style="color: #0d6100; margin: 5px 0 0;">Dat san thanh cong!</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chao <strong>${safeName}</strong>,</p>
        <p>Đơn đặt sân của bạn đã được xác nhận thành công!</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #6dff9e;">
          <h3 style="margin: 0 0 10px; color: #333;">Thong tin dat san</h3>
          <p style="margin: 5px 0;"><strong>Ma dat san:</strong> ${bookingId}</p>
          <p style="margin: 5px 0;"><strong>San:</strong> ${fieldName}</p>
          <p style="margin: 5px 0;"><strong>Ngay:</strong> ${date}</p>
          <p style="margin: 5px 0;"><strong>Gio:</strong> ${time}</p>
          <p style="margin: 5px 0;"><strong>Tong tien:</strong> <span style="color: #6dff9e; font-weight: bold;">${total} VND</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">Cam on ban da su dung dich vu San Sieu Toc!</p>
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
  const subject = 'San Sieu Toc - Yeu cau huy dat san';
  const safeName = name || 'ban';
  const { fieldName, date, time, total, bookingId, status } = bookingDetails;

  const text = [
    `Xin chao ${safeName},`,
    '',
    `Yêu cầu hủy đặt sân của bạn đã được tiến hành. Dưới đây là thông tin chi tiết về yêu cầu hủy:`,
    '',
    '--- Thong tin dat san ---',
    `Ma dat san: ${bookingId}`,
    `San: ${fieldName}`,
    `Ngay: ${date}`,
    `Gio: ${time}`,
    `Tong tien: ${total} VND`,
    `Trang thai: ${status}`,
    '',
    status === 'Đang chờ hoàn tiền'
      ? 'Vui long cho Owner xac nhan hoan tien. Tien se duoc hoan lai vao wallet sau khi xac nhan.'
      : 'Tien da duoc hoan vao wallet cua ban.',
    '',
    'Neu co thac mac, vui long lien he voi chung toi.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #ffc864, #ff9632); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #fff; margin: 0;">San Sieu Toc</h1>
        <p style="color: #fff; margin: 5px 0 0;">Yeu cau huy dat san</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chao <strong>${safeName}</strong>,</p>
        <p> Yêu cầu hủy đặt sân của bạn đã được tiến hành. Dưới đây là thông tin chi tiết về yêu cầu hủy:</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc864;">
          <h3 style="margin: 0 0 10px; color: #333;">Thong tin dat san</h3>
          <p style="margin: 5px 0;"><strong>Ma dat san:</strong> ${bookingId}</p>
          <p style="margin: 5px 0;"><strong>San:</strong> ${fieldName}</p>
          <p style="margin: 5px 0;"><strong>Ngay:</strong> ${date}</p>
          <p style="margin: 5px 0;"><strong>Gio:</strong> ${time}</p>
          <p style="margin: 5px 0;"><strong>Tong tien:</strong> ${total} VND</p>
          <p style="margin: 5px 0;"><strong>Trang thai:</strong> <span style="color: #ff9632; font-weight: bold;">${status}</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">
          ${status === 'Đang chờ hoàn tiền'
      ? 'Vui long cho Owner xac nhan hoan tien. Tien se duoc hoan lai vao wallet sau khi xac nhan.'
      : 'Tien da duoc hoan vao wallet cua ban.'}
        </p>
        <p style="color: #666; font-size: 14px;">Neu co thac mac, vui long lien he voi chung toi.</p>
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
  const subject = 'San Sieu Toc - Nap tien wallet thanh cong';
  const safeName = name || 'ban';

  const text = [
    `Xin chao ${safeName},`,
    '',
    'Tài khoản wallet của bạn đã được nạp tiền thành công!',
    '',
    '--- Chi tiet giao dich ---',
    `Ma giao dich: ${transactionId || 'N/A'}`,
    `So tien nap: +${amount} VND`,
    `So du hien tai: ${balance} VND`,
    '',
    'Ban co the su dung so du nay de dat san.',
    '',
    'Cam on ban da su dung dich vu San Sieu Toc!',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6dff9e, #2ff801); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #0d6100; margin: 0;">San Sieu Toc</h1>
        <p style="color: #0d6100; margin: 5px 0 0;">Nap tien wallet thanh cong!</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chao <strong>${safeName}</strong>,</p>
        <p>Tài khoản wallet của bạn đã được nạp tiền thành công!</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #6dff9e;">
          <h3 style="margin: 0 0 10px; color: #333;">Chi tiet giao dich</h3>
          <p style="margin: 5px 0;"><strong>Ma giao dich:</strong> ${transactionId || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>So tien nap:</strong> <span style="color: #6dff9e; font-weight: bold;">+${amount} VND</span></p>
          <p style="margin: 5px 0;"><strong>So du hien tai:</strong> <span style="font-weight: bold;">${balance} VND</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">Ban co the su dung so du nay de dat san.</p>
        <p style="color: #666; font-size: 14px;">Cam on ban da su dung dich vu San Sieu Toc!</p>
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
  const subject = 'San Sieu Toc - Hoan tien wallet thanh cong';
  const safeName = name || 'ban';

  const text = [
    `Xin chao ${safeName},`,
    '',
    'Tien hoan tu huy dat san da duoc chuyen vao wallet cua ban!',
    '',
    '--- Chi tiet hoan tien ---',
    `Ma dat san: ${bookingId}`,
    `Ly do: ${reason || 'Huy dat san'}`,
    `So tien hoan: +${amount} VND`,
    `So du hien tai: ${balance} VND`,
    '',
    'Ban co the su dung so du nay de dat san khac.',
    '',
    'Cam on ban da su dung dich vu San Sieu Toc!',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6dff9e, #2ff801); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #0d6100; margin: 0;">San Sieu Toc</h1>
        <p style="color: #0d6100; margin: 5px 0 0;">Hoan tien thanh cong!</p>
      </div>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px;">
        <p>Xin chao <strong>${safeName}</strong>,</p>
        <p>Tien hoan tu huy dat san da duoc chuyen vao wallet cua ban!</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #6dff9e;">
          <h3 style="margin: 0 0 10px; color: #333;">Chi tiet hoan tien</h3>
          <p style="margin: 5px 0;"><strong>Ma dat san:</strong> ${bookingId}</p>
          <p style="margin: 5px 0;"><strong>Ly do:</strong> ${reason || 'Huy dat san'}</p>
          <p style="margin: 5px 0;"><strong>So tien hoan:</strong> <span style="color: #6dff9e; font-weight: bold;">+${amount} VND</span></p>
          <p style="margin: 5px 0;"><strong>So du hien tai:</strong> <span style="font-weight: bold;">${balance} VND</span></p>
        </div>
        <p style="color: #666; font-size: 14px;">Ban co the su dung so du nay de dat san khac.</p>
        <p style="color: #666; font-size: 14px;">Cam on ban da su dung dich vu San Sieu Toc!</p>
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
  const subject = 'San Sieu Toc - Thong bao tai khoan Manager';
  const safeName = name || 'ban';
  const safeAdminEmail = adminEmail || user;
  const safeDate = scheduledAt instanceof Date ? scheduledAt.toLocaleString('vi-VN') : String(scheduledAt || '');

  const text = [
    `Xin chao ${safeName},`,
    '',
    'He thong nhan duoc yeu cau xoa tai khoan Manager cua ban.',
    'Ban co 3 ngay de rut het so du trong vi (neu co) truoc khi tai khoan bi xoa.',
    '',
    `Thoi gian du kien xoa tai khoan: ${safeDate}`,
    '',
    `Neu ban co thac mac, vui long lien he Admin qua email: ${safeAdminEmail}`, 
    '',
    'Tran trong,',
    'San Sieu Toc',
  ].join('\n');

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
  });
}

async function sendOwnerDeletionScheduledEmail({ to, name, scheduledAt, adminEmail }) {
  const user = process.env.EMAIL_USER;
  const subject = 'San Sieu Toc - Thong bao xoa tai khoan Owner';
  const safeName = name || 'ban';
  const safeAdminEmail = adminEmail || user;
  const safeDate = scheduledAt instanceof Date ? scheduledAt.toLocaleString('vi-VN') : String(scheduledAt || '');

  const text = [
    `Xin chao ${safeName},`,
    '',
    'He thong nhan duoc yeu cau xoa tai khoan Owner cua ban.',
    'Ban co 3 ngay de rut het so du trong vi (neu co) truoc khi tai khoan bi xoa.',
    '',
    `Thoi gian du kien xoa tai khoan: ${safeDate}`,
    '',
    `Neu ban can ho tro, vui long lien he Admin qua email: ${safeAdminEmail}`,
    '',
    'Tran trong,',
    'San Sieu Toc',
  ].join('\n');

  return getTransporter().sendMail({
    from: user,
    to,
    subject,
    text,
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
};
