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

module.exports = {
  isEmailConfigured,
  createTransporter,
  sendNewPasswordEmail,
  sendAccountCredentialsEmail,
  sendVerificationCodeEmail,
};
