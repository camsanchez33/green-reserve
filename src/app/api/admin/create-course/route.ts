import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendOperatorWelcomeEmail } from '@/lib/email';
import { resolveAdminSession } from '@/lib/admin-session';

export async function POST(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { courseName, courseType, address, city, state, zipCode, phone, website, contactName, contactEmail: rawContactEmail, contactPhone, holes, par, description, hasMemberPricing, hasResidentPricing } = body;

    if (!courseName || !contactName || !rawContactEmail || !contactPhone) {
      return NextResponse.json({ error: 'Course name, contact name, contact email, and contact phone are required' }, { status: 400 });
    }
    const contactEmail = String(rawContactEmail).trim().toLowerCase();

    // Check for existing operator
    const existing = await prisma.courseOperator.findUnique({ where: { email: contactEmail } });
    if (existing) return NextResponse.json({ error: 'An operator with this email already exists' }, { status: 409 });

    // Generate slug — make unique if needed
    const baseSlug = courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    const slugExists = await prisma.course.findUnique({ where: { slug } });
    if (slugExists) slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;

    const tempPassword = randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const verificationToken = randomBytes(32).toString('hex');

    const operator = await prisma.courseOperator.create({
      data: {
        email: contactEmail,
        password: hashed,
        name: contactName,
        phone: contactPhone,
        emailVerified: true, // admin created = pre-verified
        verificationToken,
        onboardingStep: 1,   // skip verify step, go straight to setup
        course: {
          create: {
            slug,
            name: courseName,
            type: courseType || 'public',
            address: address || '',
            city: city || '',
            state: state || '',
            zipCode: zipCode || '',
            phone: phone || '',
            website: website || '',
            holes: holes ? Number(holes) : 18,
            par: par ? Number(par) : 72,
            description: description || '',
            hasMemberPricing: hasMemberPricing || false,
            hasResidentPricing: hasResidentPricing || false,
            active: false,
          },
        },
      },
    });

    const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;

    // Send welcome email
    try {
      await sendOperatorWelcomeEmail({
        operatorName: contactName,
        operatorEmail: contactEmail,
        courseName,
        tempPassword,
        setupLink,
      });
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr);
    }

    return NextResponse.json({
      success: true,
      slug,
      tempPassword,
      setupLink,
      operatorId: operator.id,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
