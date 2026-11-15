import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@gmail.com';
  const passwordHash = await bcrypt.hash('123456', 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true, role: Role.ADMIN },
    create: { email, name: 'System Admin', role: Role.ADMIN, passwordHash, isActive: true },
    select: { email: true, role: true, isActive: true, passwordHash: true },
  });
  const matches = await bcrypt.compare('123456', user.passwordHash);
  console.log(`${user.email} ${user.role} ${user.isActive ? 'active' : 'inactive'} password ${matches ? 'ok' : 'mismatch'}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
