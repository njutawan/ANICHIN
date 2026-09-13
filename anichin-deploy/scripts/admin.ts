/**
 * Admin User Management Script
 *
 * Usage:
 *   bun run scripts/admin.ts create <email> <name> <password>
 *   bun run scripts/admin.ts promote <email>
 *   bun run scripts/admin.ts list
 *   bun run scripts/admin.ts demote <email>
 *   bun run scripts/admin.ts reset-password <email> <newPassword>
 *
 * This script should be run on the server (NEVER exposed to the client).
 * In production, run via SSH or Docker exec.
 */

import { db } from '../src/lib/db';
import { hashSync, isValidEmail } from '../src/lib/auth';

const command = process.argv[2];
const arg1 = process.argv[3]; // email
const arg2 = process.argv[4]; // name or newPassword
const arg3 = process.argv[5]; // password

async function createAdmin(email: string, name: string, password: string) {
  if (!isValidEmail(email)) {
    console.error('✗ Email tidak valid');
    process.exit(1);
  }
  if (name.length < 2 || name.length > 30) {
    console.error('✗ Nama harus 2-30 karakter');
    process.exit(1);
  }
  if (password.length < 6 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    console.error('✗ Password minimal 6 karakter, harus ada huruf + angka');
    process.exit(1);
  }

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.error(`✗ User ${email} sudah ada. Gunakan "promote" untuk jadikan admin.`);
    process.exit(1);
  }

  const user = await db.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      password: hashSync(password, 10),
      role: 'admin',
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  console.log('✓ Admin user created:');
  console.table(user);
}

async function promote(email: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`✗ User ${email} tidak ditemukan`);
    process.exit(1);
  }
  if (user.role === 'admin') {
    console.log(`ℹ ${email} sudah admin`);
    process.exit(0);
  }
  const updated = await db.user.update({
    where: { id: user.id },
    data: { role: 'admin' },
    select: { id: true, email: true, name: true, role: true },
  });
  console.log('✓ User promoted to admin:');
  console.table(updated);
}

async function listAdmins() {
  const admins = await db.user.findMany({
    where: { role: 'admin' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  console.log(`=== ${admins.length} admin user(s) ===`);
  if (admins.length > 0) {
    console.table(admins);
  } else {
    console.log('(no admins yet)');
    console.log('\nTo create one, run:');
    console.log('  bun run scripts/admin.ts create admin@anichin.id "Admin" "password123"');
  }
}

async function demote(email: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`✗ User ${email} tidak ditemukan`);
    process.exit(1);
  }
  if (user.role !== 'admin') {
    console.log(`ℹ ${email} bukan admin`);
    process.exit(0);
  }
  await db.user.update({
    where: { id: user.id },
    data: { role: 'user' },
  });
  console.log(`✓ ${email} demoted to regular user`);
}

async function resetPassword(email: string, newPassword: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`✗ User ${email} tidak ditemukan`);
    process.exit(1);
  }
  if (newPassword.length < 6 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    console.error('✗ Password minimal 6 karakter, harus ada huruf + angka');
    process.exit(1);
  }
  await db.user.update({
    where: { id: user.id },
    data: { password: hashSync(newPassword, 10) },
  });
  console.log(`✓ Password untuk ${email} telah direset`);
}

async function main() {
  await db.$connect();
  switch (command) {
    case 'create':
      if (!arg1 || !arg2 || !arg3) {
        console.error('Usage: bun run scripts/admin.ts create <email> <name> <password>');
        process.exit(1);
      }
      await createAdmin(arg1, arg2, arg3);
      break;
    case 'promote':
      if (!arg1) {
        console.error('Usage: bun run scripts/admin.ts promote <email>');
        process.exit(1);
      }
      await promote(arg1);
      break;
    case 'list':
      await listAdmins();
      break;
    case 'demote':
      if (!arg1) {
        console.error('Usage: bun run scripts/admin.ts demote <email>');
        process.exit(1);
      }
      await demote(arg1);
      break;
    case 'reset-password':
      if (!arg1 || !arg2) {
        console.error('Usage: bun run scripts/admin.ts reset-password <email> <newPassword>');
        process.exit(1);
      }
      await resetPassword(arg1, arg2);
      break;
    default:
      console.log('AniChin Admin User Manager');
      console.log('');
      console.log('Usage:');
      console.log('  bun run scripts/admin.ts create <email> <name> <password>  — Create new admin');
      console.log('  bun run scripts/admin.ts promote <email>                    — Promote existing user to admin');
      console.log('  bun run scripts/admin.ts list                              — List all admins');
      console.log('  bun run scripts/admin.ts demote <email>                    — Demote admin to user');
      console.log('  bun run scripts/admin.ts reset-password <email> <newPass>  — Reset user password');
  }
  await db.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
