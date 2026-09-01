import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const p = new PrismaClient();
p.booking.findMany({
  select: { id:true,greenFeeTotal:true,cartFeeTotal:true,rangeBallsTotal:true,accessFeeTotal:true,totalAmount:true,cancellationFeeTotal:true },
  orderBy: { id: 'asc' },
}).then(r => { fs.writeFileSync('_tmp_before.json', JSON.stringify(r, null, 0)); console.log('SNAPSHOT ' + r.length + ' bookings written'); })
  .finally(() => p.$disconnect());
