import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCourseBySlug } from '@/lib/courses-data';

/** Map a Prisma Course row to the snake_case shape the frontend expects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDbCourse(c: any) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    type: c.type,
    city: c.city,
    state: c.state,
    address: c.address,
    phone: c.phone,
    website: c.website,
    booking_url: c.bookingUrl ?? '',
    holes: c.holes,
    par: c.par,
    description: c.description,
    // DB stores amenities as string[]; frontend does .split(',') so join first
    amenities: Array.isArray(c.amenities) ? c.amenities.join(', ') : (c.amenities ?? ''),
    walking_allowed: c.walkingAllowed === 'always' || c.walkingAllowed === 'allowed',
    cart_required: c.cartRequired ?? false,
    rating: c.rating ?? 4.5,
    review_count: c.reviewCount ?? 0,
    image_gradient: c.imageGradient ?? 'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)',
    featured: c.featured ?? false,
    base_green_fee: 0,
    cart_fee: 0,
    active: c.active ?? false,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Try live DB first
  try {
    const dbCourse = await prisma.course.findUnique({ where: { slug } });
    if (dbCourse) {
      return NextResponse.json(normalizeDbCourse(dbCourse));
    }
  } catch { /* fall through to static */ }

  // Fallback: static seed data
  const course = getCourseBySlug(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return NextResponse.json(course);
}
