-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('TOUR', 'EXPERIENCE');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'NOT_OPERATING');

-- CreateEnum
CREATE TYPE "SubrangeStatus" AS ENUM ('SOLD_OUT', 'NOT_OPERATING');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('FULL', 'PARTIAL', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'REVISED', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlatformAbandonedCartStatus" AS ENUM ('open', 'recovered', 'discarded');

-- CreateEnum
CREATE TYPE "PlatformRequestStatus" AS ENUM ('new', 'in_review', 'converted', 'rejected');

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('contact', 'trial', 'enterprise');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dedicated" BOOLEAN NOT NULL DEFAULT false,
    "datasourceUrl" TEXT,
    "dbName" TEXT,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_configs" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "key" TEXT NOT NULL,
    "data" JSONB,
    "secretData" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_domains" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAdminHost" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token_blacklist" (
    "jti" TEXT NOT NULL,
    "exp" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "refresh_token_blacklist_pkey" PRIMARY KEY ("tenantId","userId","jti")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "platformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFaSecret" TEXT,
    "twoFaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "emailVerified" BOOLEAN NOT NULL DEFAULT true,
    "verificationToken" TEXT,
    "verificationTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaVerifiedAt" TIMESTAMP(3),
    "twoFaSecret" TEXT,
    "twoFaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ssoSubject" TEXT,
    "passwordHash" TEXT,
    "passwordUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_user_roles" (
    "platformUserId" TEXT NOT NULL,
    "platformRoleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_user_roles_pkey" PRIMARY KEY ("platformUserId","platformRoleId")
);

-- CreateTable
CREATE TABLE "platform_permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_role_permissions" (
    "platformRoleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_role_permissions_pkey" PRIMARY KEY ("platformRoleId","permissionId")
);

-- CreateTable
CREATE TABLE "platform_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "roleCodes" TEXT[],
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscribers" (
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "billingStatus" TEXT NOT NULL DEFAULT 'trialing',
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "assignedCsmId" TEXT,
    "mrrBand" TEXT,
    "churnRisk" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "platform_coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "amountInr" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'USD',
    "duration" TEXT NOT NULL,
    "durationInMonths" INTEGER,
    "appliesToPlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxRedemptions" INTEGER,
    "redeemBy" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "invoiceId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedByPlatformUserId" TEXT,
    "amountApplied" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "redemptionKey" TEXT NOT NULL,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_entitlements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "remainingPeriods" INTEGER,
    "unlimited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "invoiceId" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayRefId" TEXT,
    "status" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT DEFAULT '',
    "productCode" TEXT,
    "slug" TEXT,
    "description" TEXT DEFAULT '',
    "type" "ProductType" DEFAULT 'TOUR',
    "category" TEXT,
    "location" TEXT DEFAULT '',
    "duration" TEXT DEFAULT '',
    "capacity" INTEGER DEFAULT 1,
    "minPeople" INTEGER DEFAULT 1,
    "tourType" TEXT DEFAULT 'public',
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficulty" TEXT,
    "healthRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessibilityFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wheelchairAccessible" TEXT NOT NULL DEFAULT 'no',
    "strollerAccessible" TEXT NOT NULL DEFAULT 'no',
    "serviceAnimalsAllowed" TEXT NOT NULL DEFAULT 'no',
    "publicTransportAccess" TEXT NOT NULL DEFAULT 'no',
    "infantSeatsRequired" TEXT NOT NULL DEFAULT 'no',
    "infantSeatsAvailable" TEXT NOT NULL DEFAULT 'no',
    "guides" JSONB,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meetingPoint" TEXT,
    "meetingPoints" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "doesTourEndAtMeetingPoint" BOOLEAN NOT NULL DEFAULT false,
    "endPoints" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "pickupLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pickupOption" TEXT NOT NULL DEFAULT '',
    "allowTravelersPickupPoint" BOOLEAN NOT NULL DEFAULT false,
    "pickupStartTime" TEXT,
    "additionalPickupDetails" TEXT,
    "pickupLocationDetails" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "cancellationPolicy" TEXT DEFAULT '',
    "cancellationPolicyType" TEXT DEFAULT 'standard',
    "freeCancellationHours" INTEGER DEFAULT 24,
    "partialRefundPercent" INTEGER DEFAULT 50,
    "noRefundAfterHours" INTEGER DEFAULT 12,
    "cancellationTerms" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "requirePhone" BOOLEAN NOT NULL DEFAULT false,
    "requireId" BOOLEAN NOT NULL DEFAULT false,
    "requireAge" BOOLEAN NOT NULL DEFAULT false,
    "requireMedical" BOOLEAN NOT NULL DEFAULT false,
    "requireDietary" BOOLEAN NOT NULL DEFAULT false,
    "requireEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "requirePassportDetails" BOOLEAN NOT NULL DEFAULT false,
    "passportDetailsOption" TEXT DEFAULT '',
    "additionalRequirements" TEXT,
    "customRequirementFields" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "phonenumber" TEXT DEFAULT '',
    "reserveNowPayLater" BOOLEAN NOT NULL DEFAULT true,
    "cutoffTime" INTEGER DEFAULT 24,
    "paymentType" "PaymentType" NOT NULL DEFAULT 'FULL',
    "minimumPaymentPercent" INTEGER DEFAULT 20,
    "depositAmount" DOUBLE PRECISION DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "availabilityStartDate" TIMESTAMP(3),
    "availabilityEndDate" TIMESTAMP(3),
    "permanentAvailabilityStatus" "AvailabilityStatus",
    "destinationId" TEXT,
    "experienceCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itineraries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_activities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "attractionId" TEXT,
    "location" TEXT NOT NULL,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationPlaceId" TEXT,
    "isStop" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT DEFAULT '',
    "stopDuration" INTEGER,
    "duration" INTEGER,
    "durationUnit" TEXT DEFAULT 'minutes',
    "isAdmissionIncluded" BOOLEAN NOT NULL DEFAULT false,
    "inclusions" TEXT[],
    "exclusions" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "itinerary_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "discountType" TEXT DEFAULT 'none',
    "discountValue" DOUBLE PRECISION DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "inclusions" TEXT[],
    "maxPeople" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "pricingType" TEXT NOT NULL DEFAULT 'per_person',
    "ageGroups" JSONB,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_slots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "Time" TEXT[],
    "booked" INTEGER NOT NULL DEFAULT 0,
    "days" TEXT[],

    CONSTRAINT "package_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_adult_tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "slot_adult_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_child_tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "slot_child_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "bookingCode" TEXT NOT NULL,
    "productId" TEXT,
    "customDetails" JSONB,
    "packageId" TEXT,
    "slotId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "partialPaymentAmount" DOUBLE PRECISION DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "selectedTimeSlot" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "travellerDetails" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "couponCode" TEXT,
    "discountAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAvailabilitySubrange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SubrangeStatus" NOT NULL,

    CONSTRAINT "ProductAvailabilitySubrange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("tenantId","key")
);

-- CreateTable
CREATE TABLE "platform_idempotency_keys" (
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "minAmount" DOUBLE PRECISION,
    "maxDiscount" DOUBLE PRECISION,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usage" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "bookingId" TEXT,
    "bookingCode" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "coupon_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "budget" TEXT NOT NULL,
    "interests" TEXT[],
    "accommodation" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "specialRequests" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abandoned_carts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packageId" TEXT,
    "slotId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "customerData" JSONB NOT NULL,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adminNotifiedAt" TIMESTAMP(3),
    "recoverToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),

    CONSTRAINT "abandoned_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_dates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "placeId" TEXT,
    "slug" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "bannerImage" TEXT NOT NULL,
    "highlights" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attractions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "placeId" TEXT,
    "slug" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "bannerImage" TEXT NOT NULL,
    "duration" INTEGER,
    "durationUnit" TEXT DEFAULT 'minutes',
    "destinationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "bannerImage" TEXT NOT NULL,
    "highlights" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experience_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "home_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FAQ" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT[],
    "requirements" TEXT[],
    "benefits" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_proposals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT,
    "ownerId" TEXT,
    "bookingId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "customDetails" JSONB NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_proposal_revisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNote" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itinerary_proposal_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_shares" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessedAt" TIMESTAMP(3),

    CONSTRAINT "proposal_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "secret" TEXT,
    "dek" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "billingFrequency" TEXT NOT NULL,
    "marketingName" TEXT NOT NULL,
    "marketingDescription" TEXT NOT NULL,
    "featureHighlights" TEXT[],
    "public" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amountInt" INTEGER NOT NULL,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "platformCustomerId" TEXT,
    "platformSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "trialConvertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dunningAttempts" INTEGER NOT NULL DEFAULT 0,
    "dunningLastAttemptAt" TIMESTAMP(3),
    "pastDueSince" TIMESTAMP(3),
    "scheduledPlanId" TEXT,
    "scheduledPlanVersion" INTEGER,
    "scheduledChangeDate" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "platformInvoiceId" TEXT,
    "hostedInvoiceUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "priceSnapshot" JSONB NOT NULL,
    "taxSnapshot" JSONB NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "taxPercent" DOUBLE PRECISION,
    "taxAmount" INTEGER,
    "jurisdiction" TEXT,
    "usageAmount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platformCustomerId" TEXT NOT NULL,
    "gatewayPaymentMethodId" TEXT NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "name" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meter" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resourceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_abandoned_carts" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "planId" TEXT,
    "priceId" TEXT,
    "tenantCode" TEXT,
    "sessionId" TEXT NOT NULL,
    "utm" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "recoveredAt" TIMESTAMP(3),
    "status" "PlatformAbandonedCartStatus" NOT NULL DEFAULT 'open',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_abandoned_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_form_submissions" (
    "id" TEXT NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "message" TEXT,
    "attachments" JSONB,
    "utm" JSONB,
    "status" "PlatformRequestStatus" NOT NULL DEFAULT 'new',
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "convertedTenantId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretMasked" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_grants" (
    "id" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impersonation_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offboarding_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "processingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "initiatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offboarding_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "refId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT,
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_signup_attempts" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "tenantCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_signup_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_apiKey_key" ON "tenants"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "global_configs_scope_key_key" ON "global_configs"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domains_domain_key" ON "tenant_domains"("domain");

-- CreateIndex
CREATE INDEX "tenant_domains_tenantId_idx" ON "tenant_domains"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_domains_adminhost_idx" ON "tenant_domains"("tenantId", "isAdminHost");

-- CreateIndex
CREATE INDEX "tenant_domains_verified_idx" ON "tenant_domains"("verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domains_id_tenantId_key" ON "tenant_domains"("id", "tenantId");

-- CreateIndex
CREATE INDEX "refresh_token_blacklist_exp_idx" ON "refresh_token_blacklist"("exp");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenant_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE INDEX "platform_users_status_idx" ON "platform_users"("status");

-- CreateIndex
CREATE INDEX "platform_users_email_idx" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_jti_key" ON "platform_sessions"("jti");

-- CreateIndex
CREATE INDEX "platform_sessions_platformUserId_idx" ON "platform_sessions"("platformUserId");

-- CreateIndex
CREATE INDEX "platform_sessions_expiresAt_idx" ON "platform_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_roles_code_key" ON "platform_roles"("code");

-- CreateIndex
CREATE INDEX "platform_roles_code_idx" ON "platform_roles"("code");

-- CreateIndex
CREATE INDEX "platform_user_roles_platformUserId_idx" ON "platform_user_roles"("platformUserId");

-- CreateIndex
CREATE INDEX "platform_user_roles_platformRoleId_idx" ON "platform_user_roles"("platformRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_permissions_code_key" ON "platform_permissions"("code");

-- CreateIndex
CREATE INDEX "platform_permissions_code_idx" ON "platform_permissions"("code");

-- CreateIndex
CREATE INDEX "platform_role_permissions_platformRoleId_idx" ON "platform_role_permissions"("platformRoleId");

-- CreateIndex
CREATE INDEX "platform_role_permissions_permissionId_idx" ON "platform_role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invites_token_key" ON "platform_invites"("token");

-- CreateIndex
CREATE INDEX "platform_invites_email_idx" ON "platform_invites"("email");

-- CreateIndex
CREATE INDEX "platform_invites_token_idx" ON "platform_invites"("token");

-- CreateIndex
CREATE INDEX "platform_invites_expiresAt_idx" ON "platform_invites"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_tenantId_key" ON "subscribers"("tenantId");

-- CreateIndex
CREATE INDEX "subscribers_billingStatus_idx" ON "subscribers"("billingStatus");

-- CreateIndex
CREATE INDEX "subscribers_kycStatus_idx" ON "subscribers"("kycStatus");

-- CreateIndex
CREATE INDEX "subscribers_assignedCsmId_idx" ON "subscribers"("assignedCsmId");

-- CreateIndex
CREATE INDEX "subscribers_mrrBand_idx" ON "subscribers"("mrrBand");

-- CreateIndex
CREATE INDEX "subscribers_churnRisk_idx" ON "subscribers"("churnRisk");

-- CreateIndex
CREATE UNIQUE INDEX "platform_coupons_code_key" ON "platform_coupons"("code");

-- CreateIndex
CREATE INDEX "platform_coupons_code_idx" ON "platform_coupons"("code");

-- CreateIndex
CREATE INDEX "platform_coupons_active_idx" ON "platform_coupons"("active");

-- CreateIndex
CREATE INDEX "platform_coupons_createdById_idx" ON "platform_coupons"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_redemptionKey_key" ON "coupon_redemptions"("redemptionKey");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_idx" ON "coupon_redemptions"("couponId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_tenantId_idx" ON "coupon_redemptions"("tenantId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_subscriptionId_idx" ON "coupon_redemptions"("subscriptionId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_redemptionKey_idx" ON "coupon_redemptions"("redemptionKey");

-- CreateIndex
CREATE INDEX "coupon_entitlements_tenantId_idx" ON "coupon_entitlements"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_entitlements_subscriptionId_couponId_key" ON "coupon_entitlements"("subscriptionId", "couponId");

-- CreateIndex
CREATE INDEX "credit_notes_tenantId_idx" ON "credit_notes"("tenantId");

-- CreateIndex
CREATE INDEX "credit_notes_issuedById_idx" ON "credit_notes"("issuedById");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "orders_tenantId_idx" ON "orders"("tenantId");

-- CreateIndex
CREATE INDEX "orders_type_idx" ON "orders"("type");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_gateway_idx" ON "orders"("gateway");

-- CreateIndex
CREATE INDEX "orders_gatewayRefId_idx" ON "orders"("gatewayRefId");

-- CreateIndex
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

-- CreateIndex
CREATE INDEX "products_tenantId_isActive_idx" ON "products"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "products_tenantId_type_idx" ON "products"("tenantId", "type");

-- CreateIndex
CREATE INDEX "products_tenant_location_idx" ON "products"("tenantId", "location");

-- CreateIndex
CREATE INDEX "products_tenant_category_idx" ON "products"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_productCode_key" ON "products"("tenantId", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_slug_key" ON "products"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "itineraries_tenantId_idx" ON "itineraries"("tenantId");

-- CreateIndex
CREATE INDEX "itineraries_tenant_product_idx" ON "itineraries"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "itinerary_activities_tenantId_idx" ON "itinerary_activities"("tenantId");

-- CreateIndex
CREATE INDEX "itinerary_activities_tenant_itinerary_idx" ON "itinerary_activities"("tenantId", "itineraryId");

-- CreateIndex
CREATE INDEX "packages_tenantId_idx" ON "packages"("tenantId");

-- CreateIndex
CREATE INDEX "packages_tenant_product_idx" ON "packages"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "packages_tenant_active_idx" ON "packages"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "package_slots_tenantId_idx" ON "package_slots"("tenantId");

-- CreateIndex
CREATE INDEX "package_slots_packageId_idx" ON "package_slots"("packageId");

-- CreateIndex
CREATE INDEX "package_slots_tenant_package_idx" ON "package_slots"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "slot_adult_tiers_tenantId_idx" ON "slot_adult_tiers"("tenantId");

-- CreateIndex
CREATE INDEX "slot_adult_tiers_tenantId_slotId_idx" ON "slot_adult_tiers"("tenantId", "slotId");

-- CreateIndex
CREATE INDEX "slot_adult_tiers_tenant_slot_idx" ON "slot_adult_tiers"("tenantId", "slotId");

-- CreateIndex
CREATE INDEX "slot_child_tiers_tenantId_idx" ON "slot_child_tiers"("tenantId");

-- CreateIndex
CREATE INDEX "slot_child_tiers_tenantId_slotId_idx" ON "slot_child_tiers"("tenantId", "slotId");

-- CreateIndex
CREATE INDEX "slot_child_tiers_tenant_slot_idx" ON "slot_child_tiers"("tenantId", "slotId");

-- CreateIndex
CREATE INDEX "bookings_tenantId_idx" ON "bookings"("tenantId");

-- CreateIndex
CREATE INDEX "bookings_tenantId_status_idx" ON "bookings"("tenantId", "status");

-- CreateIndex
CREATE INDEX "bookings_tenantId_paymentStatus_idx" ON "bookings"("tenantId", "paymentStatus");

-- CreateIndex
CREATE INDEX "bookings_tenant_date_idx" ON "bookings"("tenantId", "bookingDate");

-- CreateIndex
CREATE INDEX "bookings_tenant_email_idx" ON "bookings"("tenantId", "customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_tenantId_bookingCode_key" ON "bookings"("tenantId", "bookingCode");

-- CreateIndex
CREATE INDEX "ProductAvailabilitySubrange_tenantId_idx" ON "ProductAvailabilitySubrange"("tenantId");

-- CreateIndex
CREATE INDEX "ProductAvailabilitySubrange_productId_startDate_endDate_idx" ON "ProductAvailabilitySubrange"("productId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "ProductAvailabilitySubrange_tenantId_productId_startDate_en_idx" ON "ProductAvailabilitySubrange"("tenantId", "productId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "availability_subrange_tenant_product_idx" ON "ProductAvailabilitySubrange"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- CreateIndex
CREATE INDEX "payments_tenant_status_idx" ON "payments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "payments_tenant_date_idx" ON "payments"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_razorpayOrderId_key" ON "payments"("tenantId", "razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_paypalOrderId_key" ON "payments"("tenantId", "paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_paypalCaptureId_key" ON "payments"("tenantId", "paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_idempotencyKey_key" ON "payments"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "idempotency_keys_tenantId_endpoint_method_idx" ON "idempotency_keys"("tenantId", "endpoint", "method");

-- CreateIndex
CREATE INDEX "platform_idempotency_keys_endpoint_method_idx" ON "platform_idempotency_keys"("endpoint", "method");

-- CreateIndex
CREATE INDEX "reviews_tenantId_idx" ON "reviews"("tenantId");

-- CreateIndex
CREATE INDEX "reviews_tenantId_isApproved_idx" ON "reviews"("tenantId", "isApproved");

-- CreateIndex
CREATE INDEX "reviews_tenantId_productId_idx" ON "reviews"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "coupons_tenantId_idx" ON "coupons"("tenantId");

-- CreateIndex
CREATE INDEX "coupons_tenantId_isActive_idx" ON "coupons"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "coupons_tenant_valid_idx" ON "coupons"("tenantId", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_tenantId_code_key" ON "coupons"("tenantId", "code");

-- CreateIndex
CREATE INDEX "coupon_usage_tenantId_idx" ON "coupon_usage"("tenantId");

-- CreateIndex
CREATE INDEX "coupon_usage_tenant_coupon_idx" ON "coupon_usage"("tenantId", "couponId");

-- CreateIndex
CREATE INDEX "coupon_usage_tenantId_bookingId_idx" ON "coupon_usage"("tenantId", "bookingId");

-- CreateIndex
CREATE INDEX "trip_requests_tenantId_idx" ON "trip_requests"("tenantId");

-- CreateIndex
CREATE INDEX "trip_requests_tenantId_status_idx" ON "trip_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "newsletters_tenantId_idx" ON "newsletters"("tenantId");

-- CreateIndex
CREATE INDEX "newsletters_tenant_active_idx" ON "newsletters"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "newsletters_tenantId_email_key" ON "newsletters"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "abandoned_carts_recoverToken_key" ON "abandoned_carts"("recoverToken");

-- CreateIndex
CREATE INDEX "abandoned_carts_tenantId_idx" ON "abandoned_carts"("tenantId");

-- CreateIndex
CREATE INDEX "abandoned_carts_tenant_email_idx" ON "abandoned_carts"("tenantId", "email");

-- CreateIndex
CREATE INDEX "blocked_dates_tenantId_idx" ON "blocked_dates"("tenantId");

-- CreateIndex
CREATE INDEX "blocked_dates_tenantId_productId_date_idx" ON "blocked_dates"("tenantId", "productId", "date");

-- CreateIndex
CREATE INDEX "blocked_dates_tenant_product_idx" ON "blocked_dates"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "destinations_tenantId_idx" ON "destinations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "destinations_tenantId_name_key" ON "destinations"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "destinations_tenantId_slug_key" ON "destinations"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "attractions_tenantId_idx" ON "attractions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "attractions_tenantId_name_key" ON "attractions"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "attractions_tenantId_slug_key" ON "attractions"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "experience_categories_tenantId_idx" ON "experience_categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "experience_categories_tenantId_name_key" ON "experience_categories"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "experience_categories_tenantId_slug_key" ON "experience_categories"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TeamMember_tenantId_idx" ON "TeamMember"("tenantId");

-- CreateIndex
CREATE INDEX "partners_tenantId_idx" ON "partners"("tenantId");

-- CreateIndex
CREATE INDEX "home_tenantId_idx" ON "home"("tenantId");

-- CreateIndex
CREATE INDEX "logo_tenantId_idx" ON "logo"("tenantId");

-- CreateIndex
CREATE INDEX "slides_tenantId_idx" ON "slides"("tenantId");

-- CreateIndex
CREATE INDEX "FAQ_tenantId_idx" ON "FAQ"("tenantId");

-- CreateIndex
CREATE INDEX "JobPosting_tenantId_idx" ON "JobPosting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_proposals_bookingId_key" ON "itinerary_proposals"("bookingId");

-- CreateIndex
CREATE INDEX "itinerary_proposals_tenantId_idx" ON "itinerary_proposals"("tenantId");

-- CreateIndex
CREATE INDEX "itinerary_proposals_tenantId_status_updatedAt_idx" ON "itinerary_proposals"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "itinerary_proposal_revisions_proposalId_version_idx" ON "itinerary_proposal_revisions"("proposalId", "version");

-- CreateIndex
CREATE INDEX "itinerary_proposal_revisions_tenantId_idx" ON "itinerary_proposal_revisions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_shares_token_key" ON "proposal_shares"("token");

-- CreateIndex
CREATE INDEX "proposal_shares_token_idx" ON "proposal_shares"("token");

-- CreateIndex
CREATE INDEX "proposal_shares_tenantId_idx" ON "proposal_shares"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_shares_tenantId_token_key" ON "proposal_shares"("tenantId", "token");

-- CreateIndex
CREATE INDEX "tenant_configs_tenantId_idx" ON "tenant_configs"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_configs_tenantId_key_idx" ON "tenant_configs"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_configs_tenantId_key_key" ON "tenant_configs"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_public_active_idx" ON "plans"("public", "active");

-- CreateIndex
CREATE UNIQUE INDEX "plan_prices_planId_currency_period_key" ON "plan_prices"("planId", "currency", "period");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_idx" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_status_idx" ON "Subscription"("tenantId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_platform_sub_idx" ON "Subscription"("platformSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_platform_customer_idx" ON "Subscription"("platformCustomerId");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "subscriptions_scheduled_change_idx" ON "Subscription"("scheduledChangeDate");

-- CreateIndex
CREATE INDEX "invoices_tenant_created_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_tenant_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "invoices_subscription_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- CreateIndex
CREATE INDEX "payment_methods_tenant_default_idx" ON "PaymentMethod"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "payment_methods_tenant_created_idx" ON "PaymentMethod"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_methods_platform_customer_idx" ON "PaymentMethod"("platformCustomerId");

-- CreateIndex
CREATE INDEX "payment_methods_gateway_pm_idx" ON "PaymentMethod"("gatewayPaymentMethodId");

-- CreateIndex
CREATE INDEX "usage_records_tenant_time_idx" ON "UsageRecord"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "usage_records_tenant_meter_time_idx" ON "UsageRecord"("tenantId", "meter", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_abandoned_carts_sessionId_key" ON "platform_abandoned_carts"("sessionId");

-- CreateIndex
CREATE INDEX "platform_abandoned_carts_status_lastSeenAt_idx" ON "platform_abandoned_carts"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "platform_abandoned_carts_email_idx" ON "platform_abandoned_carts"("email");

-- CreateIndex
CREATE INDEX "request_form_submissions_status_createdAt_idx" ON "request_form_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "request_form_submissions_email_kind_idx" ON "request_form_submissions"("email", "kind");

-- CreateIndex
CREATE INDEX "request_form_submissions_assignedToId_idx" ON "request_form_submissions"("assignedToId");

-- CreateIndex
CREATE INDEX "webhook_endpoints_provider_idx" ON "webhook_endpoints"("provider");

-- CreateIndex
CREATE INDEX "webhook_endpoints_active_idx" ON "webhook_endpoints"("active");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_provider_kind_key" ON "webhook_endpoints"("provider", "kind");

-- CreateIndex
CREATE INDEX "webhook_deliveries_provider_idx" ON "webhook_deliveries"("provider");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_receivedAt_idx" ON "webhook_deliveries"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_provider_eventId_key" ON "webhook_deliveries"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "impersonation_grants_jti_key" ON "impersonation_grants"("jti");

-- CreateIndex
CREATE INDEX "impersonation_grants_issuedById_idx" ON "impersonation_grants"("issuedById");

-- CreateIndex
CREATE INDEX "impersonation_grants_tenantId_idx" ON "impersonation_grants"("tenantId");

-- CreateIndex
CREATE INDEX "impersonation_grants_jti_idx" ON "impersonation_grants"("jti");

-- CreateIndex
CREATE INDEX "impersonation_grants_expiresAt_idx" ON "impersonation_grants"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "offboarding_jobs_tenantId_key" ON "offboarding_jobs"("tenantId");

-- CreateIndex
CREATE INDEX "kyc_records_tenantId_idx" ON "kyc_records"("tenantId");

-- CreateIndex
CREATE INDEX "kyc_records_status_idx" ON "kyc_records"("status");

-- CreateIndex
CREATE INDEX "kyc_records_reviewedById_idx" ON "kyc_records"("reviewedById");

-- CreateIndex
CREATE INDEX "audit_logs_platformUserId_idx" ON "audit_logs"("platformUserId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_signup_attempts_idempotencyKey_key" ON "public_signup_attempts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "public_signup_attempts_ownerEmail_tenantCode_key" ON "public_signup_attempts"("ownerEmail", "tenantCode");

-- AddForeignKey
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_blacklist" ADD CONSTRAINT "refresh_token_blacklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_blacklist" ADD CONSTRAINT "refresh_token_blacklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_user_roles" ADD CONSTRAINT "platform_user_roles_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_user_roles" ADD CONSTRAINT "platform_user_roles_platformRoleId_fkey" FOREIGN KEY ("platformRoleId") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_platformRoleId_fkey" FOREIGN KEY ("platformRoleId") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "platform_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invites" ADD CONSTRAINT "platform_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_coupons" ADD CONSTRAINT "platform_coupons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "platform_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_redeemedByPlatformUserId_fkey" FOREIGN KEY ("redeemedByPlatformUserId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_entitlements" ADD CONSTRAINT "coupon_entitlements_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_entitlements" ADD CONSTRAINT "coupon_entitlements_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "platform_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_experienceCategoryId_fkey" FOREIGN KEY ("experienceCategoryId") REFERENCES "experience_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_activities" ADD CONSTRAINT "itinerary_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_activities" ADD CONSTRAINT "itinerary_activities_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "attractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_activities" ADD CONSTRAINT "itinerary_activities_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_slots" ADD CONSTRAINT "package_slots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_slots" ADD CONSTRAINT "package_slots_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_adult_tiers" ADD CONSTRAINT "slot_adult_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_adult_tiers" ADD CONSTRAINT "slot_adult_tiers_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "package_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_child_tiers" ADD CONSTRAINT "slot_child_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_child_tiers" ADD CONSTRAINT "slot_child_tiers_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "package_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "package_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAvailabilitySubrange" ADD CONSTRAINT "ProductAvailabilitySubrange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAvailabilitySubrange" ADD CONSTRAINT "ProductAvailabilitySubrange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abandoned_carts" ADD CONSTRAINT "abandoned_carts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abandoned_carts" ADD CONSTRAINT "abandoned_carts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attractions" ADD CONSTRAINT "attractions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attractions" ADD CONSTRAINT "attractions_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_categories" ADD CONSTRAINT "experience_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home" ADD CONSTRAINT "home_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logo" ADD CONSTRAINT "logo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slides" ADD CONSTRAINT "slides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_proposal_revisions" ADD CONSTRAINT "itinerary_proposal_revisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_proposal_revisions" ADD CONSTRAINT "itinerary_proposal_revisions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "itinerary_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_proposal_revisions" ADD CONSTRAINT "itinerary_proposal_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_shares" ADD CONSTRAINT "proposal_shares_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_shares" ADD CONSTRAINT "proposal_shares_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "itinerary_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_configs" ADD CONSTRAINT "tenant_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_form_submissions" ADD CONSTRAINT "request_form_submissions_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_grants" ADD CONSTRAINT "impersonation_grants_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offboarding_jobs" ADD CONSTRAINT "offboarding_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offboarding_jobs" ADD CONSTRAINT "offboarding_jobs_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
