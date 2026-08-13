import { readFileSync } from 'fs';
import { resolve } from 'path';
import bcrypt from 'bcryptjs';

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

async function testPassword() {
  const { default: dbConnect } = await import('../lib/db');
  const { default: User } = await import('../models/User');
  
  await dbConnect();
  const user = await User.findOne({ email: 'ceo@company.com' }).select('+password');
  
  if (!user) {
    console.log('User NOT FOUND');
    process.exit(1);
  }
  
  console.log('Testing password comparison...');
  const result = await user.comparePassword('password123');
  console.log('Password match:', result);
  
  // Also test with bcrypt directly
  const directResult = await bcrypt.compare('password123', user.password);
  console.log('Direct bcrypt compare:', directResult);
  
  process.exit(0);
}

testPassword().catch(err => {
  console.error(err);
  process.exit(1);
});