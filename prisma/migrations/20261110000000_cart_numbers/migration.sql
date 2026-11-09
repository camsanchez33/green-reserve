-- CART-4: cart numbers, the cart ticket and the starter's sheet columns (additive).
ALTER TABLE "Course" ADD COLUMN "cartNumbers" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Course" ADD COLUMN "cartTicket" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "Course" ADD COLUMN "starterColumns" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Booking" ADD COLUMN "cartNumbers" TEXT NOT NULL DEFAULT '';
