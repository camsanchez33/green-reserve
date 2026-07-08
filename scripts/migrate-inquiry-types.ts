// One-time migration: normalize CourseInquiry.courseType to 'public' | 'private'
// municipal  → public  (residentRates flag set in needsJson)
// semi-private → private (publicTeeTimes='limited' set in needsJson)
// resort     → public  (note added to needsJson)
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/migrate-inquiry-types.ts

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const inquiries = await prisma.courseInquiry.findMany({
    where: { courseType: { in: ['municipal', 'semi-private', 'resort'] } },
    select: { id: true, courseType: true, needsJson: true },
  });

  console.log(`Found ${inquiries.length} inquiry(ies) to migrate.`);

  for (const inq of inquiries) {
    let existing: Record<string, string> = {};
    try { existing = JSON.parse(inq.needsJson || '{}'); } catch { /* empty */ }

    let newType: string;
    const needs = { ...existing };

    if (inq.courseType === 'municipal') {
      newType = 'public';
      if (!needs.residentRates) needs.residentRates = 'yes';
    } else if (inq.courseType === 'semi-private') {
      newType = 'private';
      if (!needs.publicTeeTimes) needs.publicTeeTimes = 'limited';
    } else {
      // resort
      newType = 'public';
      if (!needs._migrationNote) needs._migrationNote = 'was resort';
    }

    await prisma.courseInquiry.update({
      where: { id: inq.id },
      data: { courseType: newType, needsJson: JSON.stringify(needs) },
    });

    console.log(`  ${inq.id}: ${inq.courseType} → ${newType}`);
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
