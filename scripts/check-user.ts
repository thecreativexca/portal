import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

async function checkUser() {
  const { default: dbConnect } = await import('../lib/db');
  const { default: User } = await import('../models/User');
  
  await dbConnect();
  const user = await User.findOne({ email: 'ceo@company.com' }).select('+password');
  console.log('User found:', user ? {
    id: user._id,
    email: user.email,
    name: user.name,
    fullName: user.fullName,
    role: user.role,
    companyId: user.companyId,
    password: user.password ? 'HASHED' : 'MISSING',
    status: user.status
  } : 'NOT FOUND');
  process.exit(0);
}

checkUser().catch(err => {
  console.error(err);
  process.exit(1);
});