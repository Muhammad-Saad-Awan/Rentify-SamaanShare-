-- One Cloudinary asset must belong to at most one listing.
--
-- createListing already refuses a publicId attached elsewhere, but that check and the
-- insert are separate statements: two concurrent submissions of the same photo both
-- pass it and both write. Deleting either listing would then destroy an image the other
-- still displays. This constraint is what makes the rule hold; the application check
-- turns a violation into a readable error rather than a raw P2002.

-- CreateIndex
CREATE UNIQUE INDEX "listing_images_publicId_key" ON "listing_images"("publicId");
