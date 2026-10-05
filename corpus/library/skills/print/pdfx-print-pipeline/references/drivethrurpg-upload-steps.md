Here's a step-by-step walkthrough of the DriveThruRPG POD upload process based on their current documentation:

---

## Phase 1: Prepare Your Files

**1. Choose your layout software.** DriveThruRPG strongly recommends Affinity Publisher or Adobe InDesign. Other programs (Word, Scribus, Canva, etc.) are not officially supported and will get you limited help if errors occur. Photoshop/Illustrator are fine for image editing only, not layout.

**2. Set your PDF specs for the interior file.** Your interior PDF must meet these requirements before upload:

- Format: PDF/X-1a:2001 or PDF/X-3:2002 compliance
- Color: CMYK for color books, Grayscale for B&W (no RGB, Lab, or spot/Pantone colors)
- Total ink coverage must not exceed 240% — use the CGATS21_CRPC1.icc color profile to check this
- All fonts must be embedded
- Bleed: 0.125" on the three outside (non-binding) edges only — no bleed on the spine/binding edge
- No crop marks, registration marks, or printer marks included
- Text should sit at least 0.5" inside the page edge; non-bleeding art should have a 0.25" safety margin on outside edges and 0.5" on the binding edge
- Page count must match your book's signature (see step 4)

**3. Plan your page count around signatures.** Books 6.69" x 9.61" and larger use 4-page signatures; smaller books may use 4 or 6-page signatures. Your interior page count must be either one page fewer than your cover template's page count, or your final page must be completely blank (reserved for printer info). For example, if your book is 8.5" x 11" with 129 pages of content, you'd build a cover template for 132 pages and submit a 131-page interior.

**4. Generate your cover template.** Go to DriveThruRPG's Cover Template Generator at `drivethrurpg.com/pub_podbook_templates.php`. Enter your book size, page count, and binding type. This generates a template with the exact spine width calculated for you. You must use this template — don't build your own cover dimensions from scratch.

**5. Build your cover file to spec.** The cover PDF must also be PDF/X-1a or PDF/X-3, CMYK, fonts embedded, and all artwork placed within the crop marks on the template. No spine text is allowed on books under 48 pages.

---

## Phase 2: Set Up the Product in Publisher Hub

**6. Log into your Publisher Hub** at drivethrurpg.com. You need to be an approved Publishing Partner. If you haven't applied yet, start at `drivethrurpg.com/joininfo1.php`.

**7. Find your title.** Search for the existing product listing you want to add print to, or create a new title listing if one doesn't exist yet.

**8. Open the "Upload and manage printed book files" tool.** This is found under **Book Printing** in your Publisher Hub. Select your title and the print format you want to set up (softcover perfect bound, hardcover case laminate, color/B&W/premium).

**9. Upload your interior and cover PDFs.** The tool will accept both files. Double-check your page count matches what you entered in the cover template generator before uploading.

**10. Set a price.** You can enter the customer-facing price at this stage, though you may want to wait until after proofing to finalize it.

---

## Phase 3: Premedia Review

**11. Wait for premedia processing.** Once uploaded, the print partner runs
technical checks on the files. Processing times vary; use the status shown in
Publisher Hub rather than planning around a fixed estimate.

**12. Check your status.** You can monitor progress at any time under **Book Printing → Upload and manage printed book files** in your Publisher Hub. Statuses will update there.

**13. Fix any rejections.** If your files fail premedia, you'll get an email explaining why. Consult their "Correcting Most Common Print Errors" article (`help.drivethrupartners.com`) to troubleshoot, then re-upload corrected files. The clock resets and the whole process starts again from premedia.

---

## Phase 4: Proof and Publish

**14. Order a proof copy.** Once your files pass premedia you'll get an email notification. Go to your Publisher Hub → My Titles, find your product, and click the **Order** button next to your print format. You pay the print cost for this copy (it's just a proof, not for sale).

**15. Review the physical proof.** When it arrives, inspect it carefully — color, binding, text safety, spine. This is your only chance to catch issues before customers see it.

**16. If changes are needed, update your files.** Re-upload corrected PDFs via the same "Upload and manage printed book files" tool. You'll need to go through premedia and order a new proof again — there are no exceptions to this requirement.

**17. Activate the print listing.** Once you're satisfied with the proof, finalize your customer price and click **Make Public** to make the print version live. If you're an unverified partner, you'll need to submit for approval before it goes live.

---

From that point DriveThruRPG handles print fulfillment. Revenue shares and
print costs can change, so verify the current terms in Publisher Hub before
setting the retail price.
