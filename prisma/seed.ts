/**
 * afrus-Wolverine — Database Seed Script
 *
 * Seeds default data for a new organization:
 *   - 3 default origins
 *   - 5 default lost reasons
 *   - 1 default admin user
 *
 * Usage:
 *   SEED_ORG_ID=<uuid> \
 *   SEED_ADMIN_EMAIL=admin@org.com \
 *   SEED_ADMIN_NAME="Org Admin" \
 *   SEED_ADMIN_PASSWORD=changeme \
 *   npx prisma db seed
 *
 * Or with docker-compose exec:
 *   docker-compose exec wolverine npx ts-node prisma/seed.ts
 *
 * The seed organization is identified by SEED_ORG_ID.
 * All other seed data is created within that organization's scope.
 */

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Default origins for new organizations
const DEFAULT_ORIGINS = [
  { name: 'Web', description: 'Leads from website forms or landing pages' },
  { name: 'Referral', description: 'Leads referred by existing contacts or partners' },
  { name: 'Event', description: 'Leads from events, webinars, or conferences' },
];

// Default lost reasons
const DEFAULT_LOST_REASONS = [
  { reason: 'No budget', description: 'Lead does not have the financial resources at this time' },
  { reason: 'No urgency', description: 'Lead is interested but not ready to move forward' },
  { reason: 'Went silent', description: 'Lead stopped responding to outreach attempts' },
  { reason: 'Competitor chosen', description: 'Lead selected a competitor solution' },
  { reason: 'Timing not right', description: 'Lead reached out at the wrong time, may revisit later' },
];

// Minimal SHA-256 based hash for development seed only.
// Production password hashing uses bcrypt — this avoids adding bcrypt as a seed dependency.
function simpleHash(password: string): string {
  // Simple deterministic hash for dev seed only — NOT for production use
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  const orgId = process.env.SEED_ORG_ID;
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Admin User';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'changeme';

  if (!orgId) {
    console.error('❌  SEED_ORG_ID environment variable is required.');
    console.error('    Usage: SEED_ORG_ID=<uuid> npx prisma db seed');
    process.exit(1);
  }

  console.log(`\n🌱  Seeding Wolverine data for organization: ${orgId}`);

  // Verify the organization exists
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    console.error(`❌  Organization with ID "${orgId}" not found.`);
    console.error('    Create the organization first via the API or a separate setup script.');
    process.exit(1);
  }
  console.log(`✅  Organization found: ${org.name}`);

  // ---------------------------------------------------------------------------
  // Seed origins
  // ---------------------------------------------------------------------------
  console.log('\n📌  Seeding default origins...');
  for (const origin of DEFAULT_ORIGINS) {
    const created = await prisma.origin.upsert({
      where: {
        organizationId_name: {
          organizationId: orgId,
          name: origin.name,
        },
      },
      update: {},
      create: {
        organizationId: orgId,
        ...origin,
      },
    });
    console.log(`    ${created.name} (${created.id})`);
  }

  // ---------------------------------------------------------------------------
  // Seed lost reasons
  // ---------------------------------------------------------------------------
  console.log('\n🚫  Seeding default lost reasons...');
  for (const lostReason of DEFAULT_LOST_REASONS) {
    const created = await prisma.lostReason.upsert({
      where: {
        organizationId_reason: {
          organizationId: orgId,
          reason: lostReason.reason,
        },
      },
      update: {},
      create: {
        organizationId: orgId,
        ...lostReason,
      },
    });
    console.log(`    ${created.reason} (${created.id})`);
  }

  // ---------------------------------------------------------------------------
  // Seed default admin user
  // ---------------------------------------------------------------------------
  console.log('\n👤  Seeding default admin user...');
  const passwordHash = simpleHash(adminPassword);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      organizationId: orgId,
      email: adminEmail,
      name: adminName,
      role: UserRole.ADMIN,
      passwordHash,
    },
  });
  console.log(`    ${user.name} <${user.email}> [${user.role}] (${user.id})`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`
✅  Seed complete!

  Organization : ${org.name} (${orgId})
  Admin user   : ${adminEmail}
  Password     : ${adminPassword}  ⚠️  CHANGE THIS ON FIRST LOGIN

  Default origins created: ${DEFAULT_ORIGINS.length}
  Default lost reasons   : ${DEFAULT_LOST_REASONS.length}

  Next steps:
  1. Update the admin password immediately after first login
  2. Configure sync_tags for your afrus account
  3. Run: npx prisma migrate deploy  (to apply RLS policies)
`);
}

main()
  .catch((error) => {
    console.error('\n❌  Seed failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
