import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'green_reserve.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('public','semi-private','member','resident','resort','municipal')),
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      website TEXT,
      booking_url TEXT,
      holes INTEGER DEFAULT 18,
      par INTEGER DEFAULT 72,
      description TEXT,
      amenities TEXT,
      walking_allowed INTEGER DEFAULT 1,
      cart_required INTEGER DEFAULT 0,
      rating REAL DEFAULT 4.5,
      review_count INTEGER DEFAULT 0,
      image_gradient TEXT DEFAULT 'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)',
      featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tee_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      holes INTEGER DEFAULT 18,
      players_available INTEGER DEFAULT 4,
      green_fee REAL NOT NULL,
      cart_fee REAL DEFAULT 0,
      walking_allowed INTEGER DEFAULT 1,
      status TEXT DEFAULT 'available' CHECK(status IN ('available','limited','almost_full','unavailable')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tee_time_id INTEGER NOT NULL REFERENCES tee_times(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      golfer_name TEXT NOT NULL,
      golfer_email TEXT NOT NULL,
      players INTEGER NOT NULL,
      access_fee REAL DEFAULT 1.00,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','redirected','cancelled')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tee_times_course_date ON tee_times(course_id, date);
    CREATE INDEX IF NOT EXISTS idx_courses_type ON courses(type);
    CREATE INDEX IF NOT EXISTS idx_courses_state ON courses(state);
  `);
}

export type Course = {
  id: number;
  slug: string;
  name: string;
  type: string;
  city: string;
  state: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  booking_url: string | null;
  holes: number;
  par: number;
  description: string | null;
  amenities: string | null;
  walking_allowed: number;
  cart_required: number;
  rating: number;
  review_count: number;
  image_gradient: string;
  featured: number;
};

export type TeeTime = {
  id: number;
  course_id: number;
  date: string;
  time: string;
  holes: number;
  players_available: number;
  green_fee: number;
  cart_fee: number;
  walking_allowed: number;
  status: string;
};

// ── Seed guard ──────────────────────────────────────
let _seeded = false;
export function seedDatabase() {
  if (_seeded) return;
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as c FROM courses').get() as { c: number }).c;
  if (count > 0) { _seeded = true; return; }
  _runSeed(db);
  _seeded = true;
}

function _runSeed(db: Database.Database) {
  const COURSES = [
    { slug:'pine-valley-links', name:'Pine Valley Links', type:'public', city:'Pine Valley', state:'NJ', address:'1 Pine Valley Dr, Pine Valley, NJ 08021', phone:'(609) 555-0102', website:'https://pinevalleylinks.com', booking_url:'https://pinevalleylinks.com/book', holes:18, par:72, description:'A championship public layout winding through mature pines with dramatic elevation changes. Open to all golfers — no tee time required on weekdays.', amenities:'Driving Range,Pro Shop,Restaurant,Club Rental,Lessons', walking_allowed:1, cart_required:0, rating:4.8, review_count:312, image_gradient:'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)', featured:1 },
    { slug:'dubs-run-golf-club', name:"Dub's Run Golf Club", type:'semi-private', city:'Omaha', state:'NE', address:'5230 S 168th St, Omaha, NE 68135', phone:'(402) 555-0177', website:'https://dubsrun.com', booking_url:'https://dubsrun.com/tee-times', holes:18, par:70, description:"A semi-private gem in west Omaha with excellent conditioning and a welcoming atmosphere. Members enjoy preferred tee times; public play available most mornings.", amenities:'Driving Range,Pro Shop,Bar & Grill,Club Rental', walking_allowed:1, cart_required:0, rating:4.6, review_count:189, image_gradient:'linear-gradient(160deg,#1a2e0f 0%,#2e5016 60%,#3d6b20 100%)', featured:1 },
    { slug:'millbrook-country-club', name:'Millbrook Country Club', type:'member', city:'Westchester', state:'NY', address:'400 Millbrook Rd, Westchester, NY 10604', phone:'(914) 555-0143', website:'https://millbrookcc.com', booking_url:'https://millbrookcc.com/members', holes:18, par:71, description:'An exclusive member club set on 200 acres in Westchester County. Guests play by member invitation only. Contact the pro shop for availability.', amenities:'Driving Range,Putting Green,Fine Dining,Fitness Center,Pool,Tennis Courts', walking_allowed:0, cart_required:1, rating:4.9, review_count:74, image_gradient:'linear-gradient(160deg,#0c1f2e 0%,#1a3a5c 60%,#2a5a8c 100%)', featured:1 },
    { slug:'harbor-pines-golf-club', name:'Harbor Pines Golf Club', type:'semi-private', city:'Egg Harbor Township', state:'NJ', address:'500 St Andrews Dr, Egg Harbor Township, NJ 08234', phone:'(609) 555-0211', website:'https://harborpinesgolf.com', booking_url:'https://harborpinesgolf.com/book', holes:18, par:72, description:"An award-winning semi-private course with dramatic water features and well-bunkered greens. Consistently rated among South Jersey's best.", amenities:'Driving Range,Pro Shop,Grill Room,Club Rental,Lessons', walking_allowed:1, cart_required:0, rating:4.7, review_count:241, image_gradient:'linear-gradient(160deg,#091a2e 0%,#0f3050 60%,#1a4870 100%)', featured:1 },
    { slug:'eagle-ridge-golf-course', name:'Eagle Ridge Golf Course', type:'municipal', city:'Aurora', state:'CO', address:'16800 E Smith Rd, Aurora, CO 80011', phone:'(720) 555-0198', website:'https://eagleridgegolf.com', booking_url:'https://eagleridgegolf.com/tee-times', holes:18, par:72, description:'A well-maintained municipal course with Rocky Mountain views. Affordable rates make it a local favorite for all skill levels.', amenities:'Driving Range,Pro Shop,Snack Bar,Club Rental', walking_allowed:1, cart_required:0, rating:4.3, review_count:428, image_gradient:'linear-gradient(160deg,#1a1210 0%,#3d2010 60%,#5c3018 100%)', featured:0 },
    { slug:'stonecreek-golf-club', name:'Stonecreek Golf Club', type:'public', city:'Phoenix', state:'AZ', address:'4435 E Paradise Village Pkwy S, Phoenix, AZ 85032', phone:'(480) 555-0166', website:'https://stonecreekgolf.com', booking_url:'https://stonecreekgolf.com/reservations', holes:18, par:71, description:"A lush oasis in the Sonoran Desert with towering trees and a challenging canyon layout. One of Phoenix's most scenic courses.", amenities:'Driving Range,Pro Shop,Restaurant,Club Rental,Lessons,Practice Green', walking_allowed:0, cart_required:1, rating:4.6, review_count:567, image_gradient:'linear-gradient(160deg,#2a1a08 0%,#5c3a10 60%,#8a5c20 100%)', featured:1 },
    { slug:'blackwolf-run-meadow-valleys', name:'Blackwolf Run — Meadow Valleys', type:'resort', city:'Kohler', state:'WI', address:'1111 W Riverside Dr, Kohler, WI 53044', phone:'(920) 555-0134', website:'https://americanclub.com/golf', booking_url:'https://americanclub.com/golf/reservations', holes:18, par:72, description:'A Pete Dye masterpiece at the American Club resort. Meadow Valleys meanders along the Sheboygan River with breathtaking scenery. Open to hotel guests and the public.', amenities:'Driving Range,Putting Green,Fine Dining,Caddy Service,Lessons,Practice Facility', walking_allowed:1, cart_required:0, rating:4.9, review_count:892, image_gradient:'linear-gradient(160deg,#0f1a08 0%,#1e3510 60%,#2d5018 100%)', featured:1 },
    { slug:'town-of-oyster-bay-golf-course', name:'Town of Oyster Bay Golf Course', type:'resident', city:'Woodbury', state:'NY', address:'1 Southwoods Rd, Woodbury, NY 11797', phone:'(516) 555-0155', website:'https://oysterbaygolf.com', booking_url:'https://oysterbaygolf.com/book', holes:18, par:71, description:'A beautiful Long Island course managed by the Town of Oyster Bay. Residents enjoy discounted rates and priority tee times. Non-residents welcome at standard rates.', amenities:'Driving Range,Pro Shop,Snack Bar,Club Rental', walking_allowed:1, cart_required:0, rating:4.4, review_count:203, image_gradient:'linear-gradient(160deg,#081828 0%,#0f2840 60%,#183855 100%)', featured:0 },
  ];

  const GREEN_FEES: Record<string, number> = { 'pine-valley-links':45, 'dubs-run-golf-club':38, 'harbor-pines-golf-club':55, 'eagle-ridge-golf-course':28, 'stonecreek-golf-club':62, 'blackwolf-run-meadow-valleys':185, 'town-of-oyster-bay-golf-course':35 };
  const CART_FEES: Record<string, number> = { 'pine-valley-links':18, 'dubs-run-golf-club':16, 'harbor-pines-golf-club':20, 'eagle-ridge-golf-course':14, 'stonecreek-golf-club':22, 'blackwolf-run-meadow-valleys':30, 'town-of-oyster-bay-golf-course':16 };

  const insertCourse = db.prepare(`INSERT OR IGNORE INTO courses (slug,name,type,city,state,address,phone,website,booking_url,holes,par,description,amenities,walking_allowed,cart_required,rating,review_count,image_gradient,featured) VALUES (@slug,@name,@type,@city,@state,@address,@phone,@website,@booking_url,@holes,@par,@description,@amenities,@walking_allowed,@cart_required,@rating,@review_count,@image_gradient,@featured)`);
  const insertTeeTime = db.prepare(`INSERT INTO tee_times (course_id,date,time,holes,players_available,green_fee,cart_fee,walking_allowed,status) VALUES (@course_id,@date,@time,@holes,@players_available,@green_fee,@cart_fee,@walking_allowed,@status)`);

  db.transaction(() => {
    for (const course of COURSES) {
      insertCourse.run(course);
      const row = db.prepare('SELECT id FROM courses WHERE slug = ?').get(course.slug) as { id: number } | undefined;
      if (!row || course.type === 'member') continue;

      const greenFeeBase = GREEN_FEES[course.slug] ?? 45;
      const cartFee = CART_FEES[course.slug] ?? 18;
      const now = new Date();

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const d = new Date(now);
        d.setDate(d.getDate() + dayOffset);
        const dateStr = d.toISOString().split('T')[0];
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;

        let h = 6, m = 30;
        while (h < 15) {
          const timeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
          let mult = isWeekend ? 1.15 : 1.0;
          if (h >= 7 && h < 10) mult = isWeekend ? 1.2 : 1.1;
          if (h >= 13) mult = 0.85;
          const greenFee = Math.round(greenFeeBase * mult);
          const spots = Math.floor(Math.random() * 4) + 1;
          const statuses = ['available','available','available','limited','almost_full'];
          const status = statuses[Math.floor(Math.random() * statuses.length)];
          insertTeeTime.run({ course_id:row.id, date:dateStr, time:timeStr, holes:18, players_available:spots, green_fee:greenFee, cart_fee:cartFee, walking_allowed:course.walking_allowed, status });
          m += 8; if (m >= 60) { h++; m -= 60; }
        }
      }
    }
  })();
  console.log('✅ DB seeded');
}
