export type Course = {
  id: number;
  slug: string;
  name: string;
  type: 'public' | 'semi-private' | 'member' | 'resident' | 'resort' | 'municipal';
  city: string;
  state: string;
  address: string;
  phone: string;
  website: string;
  booking_url: string;
  holes: number;
  par: number;
  description: string;
  amenities: string[];
  walking_allowed: boolean;
  cart_required: boolean;
  rating: number;
  review_count: number;
  image_gradient: string;
  logo_url?: string;
  conditions?: string;
  hero_image_url?: string;
  featured: boolean;
  base_green_fee: number;
  cart_fee: number;
  brand_color?: string;
  gift_card_url?: string;
  hero_photo_url?: string;
  photos?: { id: string; url: string; sortOrder: number }[];
};

export type TeeTime = {
  id: string;
  course_id: number;
  date: string;
  time: string;
  holes: number;
  players_available: number;
  green_fee: number;
  cart_fee: number;
  walking_allowed: boolean;
  status: 'available' | 'limited' | 'almost_full';
};

export const COURSES: Course[] = [
  {
    id: 1,
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
    amenities: ['Driving Range', 'Pro Shop', 'Restaurant', 'Club Rental', 'Lessons'],
    walking_allowed: true,
    cart_required: false,
    rating: 4.8,
    review_count: 312,
    image_gradient: 'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)',
    featured: true,
    base_green_fee: 45,
    cart_fee: 18,
  },
  {
    id: 2,
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
    description: "A semi-private gem in west Omaha with excellent conditioning and a welcoming atmosphere. Members enjoy preferred tee times; public play available most mornings.",
    amenities: ['Driving Range', 'Pro Shop', 'Bar & Grill', 'Club Rental'],
    walking_allowed: true,
    cart_required: false,
    rating: 4.6,
    review_count: 189,
    image_gradient: 'linear-gradient(160deg,#1a2e0f 0%,#2e5016 60%,#3d6b20 100%)',
    featured: true,
    base_green_fee: 38,
    cart_fee: 16,
  },
  {
    id: 3,
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
    amenities: ['Driving Range', 'Putting Green', 'Fine Dining', 'Fitness Center', 'Pool', 'Tennis Courts'],
    walking_allowed: false,
    cart_required: true,
    rating: 4.9,
    review_count: 74,
    image_gradient: 'linear-gradient(160deg,#0c1f2e 0%,#1a3a5c 60%,#2a5a8c 100%)',
    featured: true,
    base_green_fee: 0,
    cart_fee: 0,
  },
  {
    id: 4,
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
    description: "An award-winning semi-private course with dramatic water features and well-bunkered greens. Consistently rated among South Jersey's best.",
    amenities: ['Driving Range', 'Pro Shop', 'Grill Room', 'Club Rental', 'Lessons'],
    walking_allowed: true,
    cart_required: false,
    rating: 4.7,
    review_count: 241,
    image_gradient: 'linear-gradient(160deg,#091a2e 0%,#0f3050 60%,#1a4870 100%)',
    featured: true,
    base_green_fee: 55,
    cart_fee: 20,
  },
  {
    id: 5,
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
    amenities: ['Driving Range', 'Pro Shop', 'Snack Bar', 'Club Rental'],
    walking_allowed: true,
    cart_required: false,
    rating: 4.3,
    review_count: 428,
    image_gradient: 'linear-gradient(160deg,#1a1210 0%,#3d2010 60%,#5c3018 100%)',
    featured: false,
    base_green_fee: 28,
    cart_fee: 14,
  },
  {
    id: 6,
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
    description: "A lush oasis in the Sonoran Desert with towering trees and a challenging canyon layout. One of Phoenix's most scenic courses.",
    amenities: ['Driving Range', 'Pro Shop', 'Restaurant', 'Club Rental', 'Lessons', 'Practice Green'],
    walking_allowed: false,
    cart_required: true,
    rating: 4.6,
    review_count: 567,
    image_gradient: 'linear-gradient(160deg,#2a1a08 0%,#5c3a10 60%,#8a5c20 100%)',
    featured: true,
    base_green_fee: 62,
    cart_fee: 22,
  },
  {
    id: 7,
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
    amenities: ['Driving Range', 'Putting Green', 'Fine Dining', 'Caddy Service', 'Lessons', 'Practice Facility'],
    walking_allowed: true,
    cart_required: false,
    rating: 4.9,
    review_count: 892,
    image_gradient: 'linear-gradient(160deg,#0f1a08 0%,#1e3510 60%,#2d5018 100%)',
    featured: true,
    base_green_fee: 185,
    cart_fee: 30,
  },
  {
    id: 8,
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
    amenities: ['Driving Range', 'Pro Shop', 'Snack Bar', 'Club Rental'],
    walking_allowed: true,
    cart_required: false,
    rating: 4.4,
    review_count: 203,
    image_gradient: 'linear-gradient(160deg,#081828 0%,#0f2840 60%,#183855 100%)',
    featured: false,
    base_green_fee: 35,
    cart_fee: 16,
  },
];

// Deterministic tee time generation — same output for same course+date every time
export function generateTeeTimes(course: Course, dateStr: string): TeeTime[] {
  if (course.type === 'member') return [];

  const d = new Date(dateStr + 'T12:00:00');
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

  // Simple hash for deterministic "randomness"
  function hash(n: number): number {
    let x = n;
    x = ((x >> 16) ^ x) * 0x45d9f3b;
    x = ((x >> 16) ^ x) * 0x45d9f3b;
    x = (x >> 16) ^ x;
    return Math.abs(x);
  }

  const times: TeeTime[] = [];
  let h = 6, m = 30, idx = 0;

  while (h < 15) {
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    let mult = isWeekend ? 1.15 : 1.0;
    if (h >= 7 && h < 10) mult = isWeekend ? 1.2 : 1.1;
    if (h >= 13) mult = 0.85;

    const greenFee = Math.round(course.base_green_fee * mult);
    const seed = hash(course.id * 1000 + idx + d.getDate() * 100 + d.getMonth() * 10000);
    const spots = (seed % 4) + 1;
    const statusSeed = seed % 5;
    const status = statusSeed < 3 ? 'available' : statusSeed === 3 ? 'limited' : 'almost_full';

    times.push({
      id: `${course.slug}-${dateStr}-${timeStr}`,
      course_id: course.id,
      date: dateStr,
      time: timeStr,
      holes: 18,
      players_available: spots,
      green_fee: greenFee,
      cart_fee: course.cart_fee,
      walking_allowed: course.walking_allowed,
      status: status as TeeTime['status'],
    });

    m += 8;
    if (m >= 60) { h++; m -= 60; }
    idx++;
  }

  return times;
}

export function getCourseBySlug(slug: string): Course | undefined {
  return COURSES.find(c => c.slug === slug);
}

export function searchCourses(opts: {
  q?: string;
  type?: string;
  state?: string;
  featured?: boolean;
}): Course[] {
  return COURSES.filter(c => {
    if (opts.featured && !c.featured) return false;
    if (opts.type && c.type !== opts.type) return false;
    if (opts.state && c.state !== opts.state) return false;
    if (opts.q) {
      const q = opts.q.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.city.toLowerCase().includes(q) && !c.state.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating);
}
