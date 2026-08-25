// Seed script - creates a demo user & business
// Run: node scripts/seed-user.js

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL || 'bizzautoai.solution@gmail.com';
  const password = process.env.SEED_USER_PASSWORD || (() => {
    console.error('⚠️  SEED_USER_PASSWORD not set in environment');
    console.error('Generate a secure password: openssl rand -base64 16');
    process.exit(1);
  })();
  const name = process.env.SEED_USER_NAME || 'Demo User';

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists:', existing.email);
    await prisma.$disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // Create business
  const business = await prisma.business.create({
    data: {
      name: 'BizzAuto Solutions',
      type: 'general',
      plan: 'PROFESSIONAL',
      email,
      phone: '+91 8983027975',
    },
  });

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: 'OWNER',
      businessId: business.id,
      isActive: true,
      emailVerified: new Date(),
    },
  });

  console.log('✅ User created:', user.email);
  console.log('✅ Business created:', business.name);
  console.log('⚠️  Store credentials securely - password will not be displayed again');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
