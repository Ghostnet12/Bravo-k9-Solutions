# Preview QA

Local source passed Node syntax checks and static build. VERCEL_ENV=production was tested and rejected by the build guard.

Offline Chromium layout/interaction checks passed at 320x740, 390x844, 768x1024, and 1440x1000: no document horizontal overflow; 8/2/6 all/everyday/working program filtering; program detail dialog; program preselection; three-step local booking flow; day/time summary; close buttons; gallery navigation; Escape close; mobile navigation and expanded state. No page JavaScript errors were observed.

Important limitation: the runtime could not download repository photography. Offline layout checks used a test-only image substitute from the approved mockup; that substitute is NOT committed or deployed. The production preview reuses the existing public image tree by Git blob reference. Visual verification of the exact deployed image crops and iPhone video-codec playback remains a review step.

Atlas connector was read-only. The attempted insert returned an access error and changed nothing. No production customer data was read. The preview API requires a separate, least-privilege preview credential and otherwise reports bundled demo content. No production application code or operational API routes are included.
