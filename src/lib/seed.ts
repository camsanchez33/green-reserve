import { getDb } from './db';

const COURSES = [
  {
    slug: 'pine-valley-links',
    name: 'Pine Valley Links',
    type: 'public',
    city: 'Pine Valley',
    state: 'NJ',
    address: '1 Pine Valley Dr, Pine Valley, NJ 08021',
    phone: '(609) 555-0102',
    website: 'https://pinevalleylinks.com',
    booking_url: 'https://pinevalleylinks.com/book',
    holes: 18,
    par: 72,
    description: 'A championship public layout winding through mature pines with dramatic elevation changes. Open to all golfers — no tee time required on weekdays.',
    amenities: 'Driving Range,Pro Shop,Restaurant,Club Rental,Lessons',
    walking_allowed: 1,
    cart_required: 0,
    rating: 4.8,
    review_count: 312,
    image_gradient: 'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)',
    featured: 1,
  },
  {
    slug: 'dubs-run-golf-club',
    name: "Dub's Run Golf Club",
    type: 'semi-private',
    city: 'Omaha',
    state: 'NE',
    address: '5230 S 168th St, Omaha, NE 68135',
    phone: '(402) 555-0177',
    website: 'https://dubsrun.com',
    booking_url: 'https://dubsrun.com/tee-times',
    holes: 18,
    par: 70,
    description: 'A semi-private gem in west Omaha with excellent conditioning and a welcoming atmosphere. Members enjoy preferred tee times; public play available most mornings.',
    amenities: 'Driving Range,Pro Shop,Bar & Grill,Club Rental',
    walking_allowed: 1,
    cart_required: 0,
    rating: 4.6,
    review_count: 189,
    image_gradient: 'linear-gradient(160deg,#1a2e0f 0%,#2e5016 60%,#3d6b20 100%)',
    featured: 1,
  },
  {
    slug: 'millbrook-country-club',
    name: 'Millbrook Country Club',
    type: 'member',
    city: 'Westchester',
    state: 'NY',
    address: '400 Millbrook Rd, Westchester, NY 10604',
    phone: '(914) 555-0143',
    website: 'https://millbrookcc.com',
    booking_url: 'https://millbrookcc.com/members',
    holes: 18,
    par: 71,
    description: 'An exclusive member club set on 200 acres in Westchester County. Guests play by member invitation only. Contact the pro shop for availability.',
    amenities: 'Driving Range,Putting Green,Fine Dining,Fitness Center,Pool,Tennis Courts',
    walking_allowed: 0,
    cart_required: 1,
    rating: 4.9,
    review_count: 74,
    image_gradient: 'linear-gradient(160deg,#0c1f2e 0%,#1a3a5c 60%,#2a5a8c 100%)',
    featured: 1,
  },
  {
    slug: 'harbor-pines-golf-club',
    name: 'Harbor Pines Golf Club',
    type: 'semi-private',
    city: 'Egg Harbor Township',
    state: 'NJ',
    address: '500 St Andrews Dr, Egg Harbor Township, NJ 08234',
    phone: '(609) 555-0211',
    website: 'https://harborpinesgolf.com',
    booking_url: 'https://harborpinesgolf.com/book',
    holes: 18,
    par: 72,
    description: 'An award-winning semi-private course with dramatic water features and well-bunkered greens. Consistently rated among South Jersey\'s best.',
    amenities: 'Driving Range,Pro Shop,Grill Room,Club Rental,Lessons',
    walking_allowed: 1,
    cart_required: 0,
    rating: 4.7,
    review_count: 241,
    image_gradient: 'linear-gradient(160deg,#091a2e 0%,#0f3050 60%,#1a4870 100%)',
    featured: 1,
  },
  {
    slug: 'eagle-ridge-golf-course',
    name: 'Eagle Ridge Golf Course',
    type: 'municipal',
    city: 'Aurora',
    state: 'CO',
    address: '16800 E Smith Rd, Aurora, CO 80011',
    phone: '(720) 555-0198',
    website: 'https://eagleridgegolf.com',
    booking_url: 'https://eagleridgegolf.com/tee-times',
    holes: 18,
    par: 72,
    description: 'A well-maintained municipal course with Rocky Mountain views. Affordable rates make it a local favorite for all skill levels.',
    amenities: 'Driving Range,Pro Shop,Snack Bar,Club Rental',
    walking_allowed: 1,
    cart_required: 0,
    rating: 4.3,
    review_count: 428,
    image_gradient: 'linear-gradient(160deg,#1a1210 0%,#3d2010 60%,#5c3018 100%)',
    featured: 0,
  },
  {
    slug: 'stonecreek-golf-club',
    name: 'Stonecreek Golf Club',
    type: 'public',
    city: 'Phoenix',
    state: 'AZ',
    address: '4435 E Paradise Village Pkwy S, Phoenix, AZ 85032',
    phone: '(480) 555-0166',
    website: 'https://stonecreekgolf.com',
    booking_url: 'https://stonecreekgolf.com/reservations',
    holes: 18,
    par: 71,
    description: 'A lush oasis in the Sonoran Desert with towering trees and a challenging canyon layout. One of Phoenix\'s most scenic courses.',
    amenities: 'Driving Range,Pro Shop,Restaurant,Club Rental,Lessons,Practice Green',
    walking_allowed: 0,
    cart_required: 1,
    rating: 4.6,
    review_count: 567,
    image_gradient: 'linear-gradient(160deg,#2a1a08 0%,#5c3a10 60%,#8a5c20 100%)',
    featured: 1,
  },
  {
    slug: 'blackwolf-run-meadow-valleys',
    name: 'Blackwolf Run — Meadow Valleys',
    type: 'resort',
    city: 'Kohler',
    state: 'WI',
    address: '1111 W Riverside Dr, Kohler, WI 53044',
    phone: '(920) 555-0134',
    website: 'https://americanclub.com/golf',
    booking_url: 'https://americanclub.com/golf/reservations',
    holes: 18,
    par: 72,
    description: 'A Pete Dye masterpiece at the American Club resort. Meadow Valleys meanders along the Sheboygan River with breathtaking scenery. Open to hotel guests and the public.',
    amenities: 'Driving Range,Putting Green,Fine Dining,Caddy Service,Lessons,Practice Facility',
    walking_allowed: 1,
    cart_required: 0,
    rating: 4.9,
    review_count: 892,
    image_gradient: 'linear-gradient(160deg,#0f1a08 0%,#1e3510 60%,#2d5018 100%)',
    featured: 1,
  },
  {
    slug: 'town-of-oyster-bay-golf-course',
    name: 'Town of Oyster Bay Golf Course',
    type: 'resident',
    city: 'Woodbury',
    state: 'NY',
    address: '1 Southwoods Rd, Woodbury, NY 11797',
    phone: '(516) 555-0155',
    website: 'https://oysterbaygolf.com',
    booking_url: 'https://oysterbaygolf.com/book',
    holes: 18,
    par: 71,
    description: 'A beautiful Long Island course managed by the Town of Oyster Bay. Residents enjoy discounted rates and priority tee times. Non-residents welcome at standard rates.',
    amenities: 'Driving Range,Pro Shop,Snack Bar,Club Rental',
    walking_allowed: 1,
    cart_required: 0,
    rating: 4.4,
    review_count: 203,
    image_gradient: 'linear-gradient(160deg,#081828 0%,#0f2840 60%,#183855 100%)',
    featured: 0,
  },
];

// Generate tee times for the next 7 days for a course
function generateTeeTimes(courseId: number, greenFeeBase: number, cartFee: number, walkingAllowed: boolean) {
  const times = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];

    // Tee times from 6:30 AM to 3:00 PM in 8-minute intervals
    let hour = 6;
    let minute = 30;
    let priceMultiplier = 1.0;

    while (hour < 15) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      // Weekend premium
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      if (isWeekend) priceMultiplier = 1.15;

      // Morning peak (7-10 AM): slight premium
      if (hour >= 7 && hour < 10) priceMultiplier = isWeekend ? 1.2 : 1.1;
      // Afternoon discount after 1 PM
      if (hour >= 13) priceMultiplier = 0.85;

      const greenFee = Math.round(greenFeeBase * priceMultiplier);
      const playersAvail = Math.floor(Math.random() * 4) + 1;
      const statuses = ['available', 'available', 'available', 'limited', 'almost_full'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      times.push({
        course_id: courseId,
        date: dateStr,
        time: timeStr,
        holes: 18,
        players_available: playersAvail,
        green_fee: greenFee,
        cart_fee: cartFee,
        walking_allowed: walkingAllowed ? 1 : 0,
        status,
      });

      minute += 8;
      if (minute >= 60) {
        hour++;
        minute = minute - 60;
      }
    }
  }
  return times;
}

export function seedDatabase() {
  const db = getDb();

  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM courses').get() as { c: number }).c;
  if (existingCount > 0) return; // already seeded

  const insertCourse = db.prepare(`
    INSERT OR IGNORE INTO courses (slug,name,type,city,state,address,phone,website,booking_url,holes,par,description,amenities,walking_allowed,cart_required,rating,review_count,image_gradient,featured)
    VALUES (@slug,@name,@type,@city,@state,@address,@phone,@website,@booking_url,@holes,@par,@description,@amenities,@walking_allowed,@cart_required,@rating,@review_count,@image_gradient,@featured)
  `);

  const insertTeeTime = db.prepare(`
    INSERT INTO tee_times (course_id,date,time,holes,players_available,green_fee,cart_fee,walking_allowed,status)
    VALUES (@course_id,@date,@time,@holes,@players_available,@green_fee,@cart_fee,@walking_allowed,@status)
  `);

  const greenFees: Record<string, number> = {
    'pine-valley-links': 45,
    'dubs-run-golf-club': 38,
    'millbrook-country-club': 0,
    'harbor-pines-golf-club': 55,
    'eagle-ridge-golf-course': 28,
    'stonecreek-golf-club': 62,
    'blackwolf-run-meadow-valleys': 185,
    'town-of-oyster-bay-golf-course': 35,
  };

  const cartFees: Record<string, number> = {
    'pine-valley-links': 18,
    'dubs-run-golf-club': 16,
    'millbrook-country-club': 0,
    'harbor-pines-golf-club': 20,
    'eagle-ridge-golf-course': 14,
    'stonecreek-golf-club': 22,
    'blackwolf-run-meadow-valleys': 30,
    'town-of-oyster-bay-golf-course': 16,
  };

  db.transaction(() => {
    for (const course of COURSES) {
      insertCourse.run(course);
      const row = db.prepare('SELECT id FROM courses WHERE slug = ?').get(course.slug) as { id: number };
      if (!row) continue;

      // Don't generate tee times for member-only courses
      if (course.type === 'member') continue;

      const teeTimes = generateTeeTimes(
        row.id,
        greenFees[course.slug] || 45,
        cartFees[course.slug] || 18,
        course.walking_allowed === 1,
      );
      for (const tt of teeTimes) {
        insertTeeTime.run(tt);
      }
    }
  })();

  console.log('✅ Database seeded');
}
