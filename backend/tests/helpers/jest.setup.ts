// adjust the import path to YOUR singleton
import { prisma } from '../../src/utils/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});