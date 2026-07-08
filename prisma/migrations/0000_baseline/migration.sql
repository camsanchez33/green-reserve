-- CreateTable
CREATE TABLE "CourseOperator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorMethod" TEXT NOT NULL DEFAULT 'email',
    "twoFactorCode" TEXT,
    "twoFactorCodeExpiry" TIMESTAMP(3),
    "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'public',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "bookingUrl" TEXT NOT NULL DEFAULT '',
    "holes" INTEGER NOT NULL DEFAULT 18,
    "par" INTEGER NOT NULL DEFAULT 72,
    "yardage" INTEGER NOT NULL DEFAULT 0,
    "slope" INTEGER NOT NULL DEFAULT 0,
    "courseRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "amenities" TEXT[],
    "walkingAllowed" TEXT NOT NULL DEFAULT 'always',
    "walkingNote" TEXT NOT NULL DEFAULT '',
    "cartRequired" BOOLEAN NOT NULL DEFAULT false,
    "dresscode" TEXT[],
    "minPlayers" INTEGER NOT NULL DEFAULT 1,
    "maxPlayers" INTEGER NOT NULL DEFAULT 4,
    "cancellationHours" INTEGER NOT NULL DEFAULT 24,
    "lateCancellationFee" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "rainCheckPolicy" TEXT NOT NULL DEFAULT '',
    "publicAdvanceDays" INTEGER NOT NULL DEFAULT 7,
    "memberAdvanceDays" INTEGER NOT NULL DEFAULT 14,
    "hasMemberPricing" BOOLEAN NOT NULL DEFAULT false,
    "hasResidentPricing" BOOLEAN NOT NULL DEFAULT false,
    "residentCounty" TEXT NOT NULL DEFAULT '',
    "residentState" TEXT NOT NULL DEFAULT '',
    "residentProofRequired" BOOLEAN NOT NULL DEFAULT false,
    "hasCaddies" BOOLEAN NOT NULL DEFAULT false,
    "caddieType" TEXT NOT NULL DEFAULT '',
    "caddieLooperRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "caddieForeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "caddieNote" TEXT NOT NULL DEFAULT '',
    "hasDrivingRange" BOOLEAN NOT NULL DEFAULT false,
    "drivingRangeType" TEXT NOT NULL DEFAULT '',
    "rangeBallsFree" BOOLEAN NOT NULL DEFAULT true,
    "rangeBallsSmallPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rangeBallsMediumPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rangeBallsLargePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasPuttingGreen" BOOLEAN NOT NULL DEFAULT false,
    "hasShortGameArea" BOOLEAN NOT NULL DEFAULT false,
    "hasProShop" BOOLEAN NOT NULL DEFAULT false,
    "proShopPhone" TEXT NOT NULL DEFAULT '',
    "restaurantType" TEXT NOT NULL DEFAULT 'none',
    "hasCartGirl" BOOLEAN NOT NULL DEFAULT false,
    "tournamentFrequency" TEXT NOT NULL DEFAULT '',
    "hasLessons" BOOLEAN NOT NULL DEFAULT false,
    "hasClubRental" BOOLEAN NOT NULL DEFAULT false,
    "clubRentalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasPushCartRental" BOOLEAN NOT NULL DEFAULT false,
    "pushCartRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasBagStorage" BOOLEAN NOT NULL DEFAULT false,
    "hasLockerRoom" BOOLEAN NOT NULL DEFAULT false,
    "hasGpsCarts" BOOLEAN NOT NULL DEFAULT false,
    "hasTournaments" BOOLEAN NOT NULL DEFAULT false,
    "stripeAccountId" TEXT NOT NULL DEFAULT '',
    "stripeAccountActive" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "imageGradient" TEXT NOT NULL DEFAULT 'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)',
    "brandColor" TEXT NOT NULL DEFAULT '#24513B',
    "establishedYear" INTEGER,
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "heroImageUrl" TEXT NOT NULL DEFAULT '',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "liveStatus" TEXT NOT NULL DEFAULT 'draft',
    "welcomeEmailSentAt" TIMESTAMP(3),
    "adminNotes" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "operatorId" TEXT,
    "conditions" TEXT NOT NULL DEFAULT '',
    "conditionsUpdatedAt" TIMESTAMP(3),
    "giftCardUrl" TEXT NOT NULL DEFAULT '',
    "heroPhotoUrl" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePhoto" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeeSet" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yardage" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slope" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseStaff" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolferAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolferAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTier" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1b4332',
    "greenFeeWeekday" DOUBLE PRECISION,
    "greenFeeWeekend" DOUBLE PRECISION,
    "cartFeeWeekday" DOUBLE PRECISION,
    "cartFeeWeekend" DOUBLE PRECISION,
    "discountPct" DOUBLE PRECISION,
    "advanceBookingDays" INTEGER NOT NULL DEFAULT 14,
    "guestPassesPerYear" INTEGER NOT NULL DEFAULT 0,
    "annualFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "initiationFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "termMonths" INTEGER NOT NULL DEFAULT 12,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMembership" (
    "id" TEXT NOT NULL,
    "golferId" TEXT,
    "courseId" TEXT NOT NULL,
    "tierId" TEXT,
    "membershipType" TEXT NOT NULL DEFAULT 'member',
    "inviteEmail" TEXT NOT NULL DEFAULT '',
    "inviteName" TEXT NOT NULL DEFAULT '',
    "invitePhone" TEXT NOT NULL DEFAULT '',
    "inviteAccepted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "addedBy" TEXT NOT NULL DEFAULT 'operator',
    "expiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "payToken" TEXT NOT NULL DEFAULT '',
    "lastPaidAt" TIMESTAMP(3),
    "lastPaymentIntentId" TEXT NOT NULL DEFAULT '',
    "renewalRemindedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeeTime" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "holes" INTEGER NOT NULL DEFAULT 18,
    "playersAvailable" INTEGER NOT NULL DEFAULT 4,
    "playersBooked" INTEGER NOT NULL DEFAULT 0,
    "greenFee" DOUBLE PRECISION NOT NULL,
    "memberRate" DOUBLE PRECISION,
    "residentRate" DOUBLE PRECISION,
    "cartFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "walkingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "tierName" TEXT NOT NULL DEFAULT 'standard',
    "status" TEXT NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeeTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "teeTimeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "golferAccountId" TEXT,
    "golferName" TEXT NOT NULL,
    "golferEmail" TEXT NOT NULL,
    "golferPhone" TEXT NOT NULL DEFAULT '',
    "players" INTEGER NOT NULL,
    "appliedRate" TEXT NOT NULL DEFAULT 'standard',
    "greenFeeTotal" DOUBLE PRECISION NOT NULL,
    "cartFeeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cartSelected" BOOLEAN NOT NULL DEFAULT false,
    "rangeBallsSize" TEXT NOT NULL DEFAULT '',
    "rangeBallsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accessFeeTotal" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "stripePaymentMethodId" TEXT NOT NULL DEFAULT '',
    "stripePaymentIntentId" TEXT NOT NULL DEFAULT '',
    "cancellationFeeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cancellationFeeChargeId" TEXT NOT NULL DEFAULT '',
    "cancellationFeeChargedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "checkInToken" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "roundPaymentIntentId" TEXT NOT NULL DEFAULT '',
    "checkInFailReason" TEXT NOT NULL DEFAULT '',
    "paymentStatus" TEXT NOT NULL DEFAULT 'card_on_file',
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeeTimeSchedule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "tierName" TEXT NOT NULL DEFAULT 'standard',
    "daysOfWeek" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 8,
    "holes" INTEGER NOT NULL DEFAULT 18,
    "greenFeeWeekday" DOUBLE PRECISION NOT NULL,
    "greenFeeWeekend" DOUBLE PRECISION NOT NULL,
    "memberRateWeekday" DOUBLE PRECISION,
    "memberRateWeekend" DOUBLE PRECISION,
    "residentRateWeekday" DOUBLE PRECISION,
    "residentRateWeekend" DOUBLE PRECISION,
    "cartFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "walkingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeeTimeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blackout" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Blackout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeeTimeAlert" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "windowStart" TEXT NOT NULL DEFAULT '',
    "windowEnd" TEXT NOT NULL DEFAULT '',
    "players" INTEGER NOT NULL DEFAULT 1,
    "teeTimeId" TEXT,
    "token" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeeTimeAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseInquiry" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL,
    "contactTitle" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "website" TEXT NOT NULL DEFAULT '',
    "courseType" TEXT NOT NULL,
    "currentBookingMethod" TEXT NOT NULL DEFAULT '',
    "teeTimesPerDay" INTEGER,
    "greenFeeRange" TEXT NOT NULL DEFAULT '',
    "hasResidentPricing" BOOLEAN NOT NULL DEFAULT false,
    "hasMemberPricing" BOOLEAN NOT NULL DEFAULT false,
    "hasCaddies" BOOLEAN NOT NULL DEFAULT false,
    "pricingNotes" TEXT NOT NULL DEFAULT '',
    "facilitiesNotes" TEXT NOT NULL DEFAULT '',
    "lookingFor" TEXT[],
    "additionalNotes" TEXT NOT NULL DEFAULT '',
    "needsJson" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT NOT NULL DEFAULT '',
    "builtCourseId" TEXT,
    "detailsToken" TEXT,
    "detailsJson" TEXT NOT NULL DEFAULT '',
    "reviewStartedAt" TIMESTAMP(3),
    "wentLiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryStatusEvent" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'manager',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setPasswordToken" TEXT,
    "setPasswordTokenExpiry" TIMESTAMP(3),
    "twoFactorCode" TEXT,
    "twoFactorCodeExpiry" TIMESTAMP(3),
    "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "sentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "adminLastEmailAt" TIMESTAMP(3),
    "operatorLastEmailAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "isBroadcast" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseOperator_email_key" ON "CourseOperator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOperator_resetToken_key" ON "CourseOperator"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Course_operatorId_key" ON "Course"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStaff_email_key" ON "CourseStaff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GolferAccount_email_key" ON "GolferAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GolferAccount_resetToken_key" ON "GolferAccount"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMembership_golferId_courseId_key" ON "CourseMembership"("golferId", "courseId");

-- CreateIndex
CREATE INDEX "TeeTime_courseId_date_idx" ON "TeeTime"("courseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_checkInToken_key" ON "Booking"("checkInToken");

-- CreateIndex
CREATE UNIQUE INDEX "TeeTimeAlert_token_key" ON "TeeTimeAlert"("token");

-- CreateIndex
CREATE INDEX "TeeTimeAlert_courseId_date_idx" ON "TeeTimeAlert"("courseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CourseInquiry_detailsToken_key" ON "CourseInquiry"("detailsToken");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_setPasswordToken_key" ON "AdminUser"("setPasswordToken");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDismissal_announcementId_operatorId_key" ON "AnnouncementDismissal"("announcementId", "operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_courseId_key" ON "MessageThread"("courseId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "CourseOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePhoto" ADD CONSTRAINT "CoursePhoto_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeSet" ADD CONSTRAINT "TeeSet_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStaff" ADD CONSTRAINT "CourseStaff_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTier" ADD CONSTRAINT "MembershipTier_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMembership" ADD CONSTRAINT "CourseMembership_golferId_fkey" FOREIGN KEY ("golferId") REFERENCES "GolferAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMembership" ADD CONSTRAINT "CourseMembership_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMembership" ADD CONSTRAINT "CourseMembership_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "MembershipTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeTime" ADD CONSTRAINT "TeeTime_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_teeTimeId_fkey" FOREIGN KEY ("teeTimeId") REFERENCES "TeeTime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_golferAccountId_fkey" FOREIGN KEY ("golferAccountId") REFERENCES "GolferAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeTimeSchedule" ADD CONSTRAINT "TeeTimeSchedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeTimeAlert" ADD CONSTRAINT "TeeTimeAlert_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeTimeAlert" ADD CONSTRAINT "TeeTimeAlert_teeTimeId_fkey" FOREIGN KEY ("teeTimeId") REFERENCES "TeeTime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryStatusEvent" ADD CONSTRAINT "InquiryStatusEvent_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CourseInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

