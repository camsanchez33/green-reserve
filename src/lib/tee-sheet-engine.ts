import { prisma } from './prisma';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

export async function generateTeeTimes(courseId: string, dateStr: string): Promise<number> {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const blackout = await prisma.blackout.findFirst({ where: { courseId, date: dateStr } });
  if (blackout) return 0;

  const schedules = await prisma.teeTimeSchedule.findMany({ where: { courseId, active: true } });
  const applicable = schedules.filter(
    s => s.daysOfWeek.length === 0 || s.daysOfWeek.includes(dayOfWeek)
  );
  if (applicable.length === 0) return 0;

  await prisma.teeTime.deleteMany({ where: { courseId, date: dateStr } });

  let created = 0;
  for (const schedule of applicable) {
    const greenFee = isWeekend ? schedule.greenFeeWeekend : schedule.greenFeeWeekday;
    const memberRate = isWeekend ? schedule.memberRateWeekend : schedule.memberRateWeekday;
    const residentRate = isWeekend ? schedule.residentRateWeekend : schedule.residentRateWeekday;

    let current = timeToMinutes(schedule.startTime);
    const end = timeToMinutes(schedule.endTime);

    while (current < end) {
      await prisma.teeTime.create({
        data: {
          courseId,
          date: dateStr,
          time: minutesToTime(current),
          holes: schedule.holes,
          playersAvailable: 4,
          playersBooked: 0,
          greenFee,
          memberRate: memberRate ?? null,
          residentRate: residentRate ?? null,
          cartFee: schedule.cartFee,
          walkingAllowed: schedule.walkingAllowed,
          tierName: schedule.tierName,
          status: 'available',
        },
      });
      current += schedule.intervalMinutes;
      created++;
    }
  }
  return created;
}

export async function generateForAllCourses(daysAhead = 8): Promise<void> {
  const schedules = await prisma.teeTimeSchedule.findMany({
    where: { active: true },
    select: { courseId: true },
    distinct: ['courseId'],
  });
  const today = new Date();
  for (const { courseId } of schedules) {
    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      await generateTeeTimes(courseId, d.toISOString().split('T')[0]);
    }
  }
}
