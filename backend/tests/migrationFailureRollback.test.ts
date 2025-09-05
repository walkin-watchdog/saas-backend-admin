import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/utils/prisma';

const execAsync = promisify(exec);

describe('Migration Failure Rollback', () => {
  const testMigrationPath = path.join(process.cwd(), 'prisma', 'migrations', 'test_bad_migration');
  const testMigrationFile = path.join(testMigrationPath, 'migration.sql');

  beforeAll(() => {
    if (!fs.existsSync(testMigrationPath)) {
      fs.mkdirSync(testMigrationPath, { recursive: true });
    }
    const badSQL = `
      -- This migration will fail intentionally
      CREATE TABLE "nonexistent_parent" (
        "id" TEXT PRIMARY KEY
      );
      -- This will fail because referenced table doesn't exist
      ALTER TABLE "products" ADD CONSTRAINT "bad_fk" 
        FOREIGN KEY ("nonexistent_column") REFERENCES "nonexistent_table"("id");
    `;
    fs.writeFileSync(testMigrationFile, badSQL);
  });

  afterAll(async () => {
    if (fs.existsSync(testMigrationPath)) {
      fs.rmSync(testMigrationPath, { recursive: true, force: true });
    }
  });

  it('should rollback failed migrations', async () => {
    try {
      await execAsync('npx prisma migrate deploy');
      fail('Expected migration to fail but it succeeded');
    } catch (error) {
      expect(error).toBeDefined();

      // finished_at IS NULL for the bad migration
      const finishedNullRows = await prisma.$queryRaw<Array<{ is_null: number }>>`
        select (finished_at is null)::int as is_null
        from "_prisma_migrations"
        where migration_name = 'test_bad_migration'
        order by started_at desc
        limit 1
      `;
      expect(finishedNullRows.length).toBe(1);
      expect(finishedNullRows[0].is_null).toBe(1);

      // applied_steps_count = 0
      const stepsRows = await prisma.$queryRaw<Array<{ steps: number }>>`
        select coalesce(applied_steps_count, 0) as steps
        from "_prisma_migrations"
        where migration_name = 'test_bad_migration'
        order by started_at desc
        limit 1
      `;
      expect(stepsRows.length).toBe(1);
      expect(stepsRows[0].steps).toBe(0);

      // ensure no stray constraint exists
      const constraintRows = await prisma.$queryRaw<Array<{ constraint_name: string }>>`
        select constraint_name
        from information_schema.table_constraints
        where table_schema = 'public'
          and table_name = 'products'
          and constraint_name = 'bad_fk'
      `;
      expect(constraintRows.length).toBe(0);
    }
  });

  it('should handle transactional migration rollback', async () => {
    // products table still exists & is queryable (count)
    const productCount = await prisma.product.count();
    expect(typeof productCount).toBe('number');

    // Verify no bad foreign key constraints were added
    const constraints = await prisma.$queryRaw<Array<{ constraint_name: string }>>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'products'
        and constraint_name = 'bad_fk'
    `;
    expect(constraints.length).toBe(0);
  });
});