# Xyleme

Research notes on Xyleme SCORM exports, the player, and LMS delivery. Based on public sources only. Public detail is thin. Most points below are unconfirmed. Nothing here was checked against a real Xyleme export.

Note: the xyleme.com FAQ address redirects to a MadCap Software product page. That page names MadCap Create and MadCap SyndicateAI, not Xyleme. This suggests Xyleme products now sit under MadCap, but I did not confirm that. Treat any MadCap-named detail as a different product unless shown otherwise.

## File layout

- Unconfirmed: no public page describes the folders in a Xyleme SCORM export.
- Unconfirmed: no public page names the player files or the launch file.
- Generic SCORM rule (not Xyleme-specific): a SCORM package has `imsmanifest.xml` at the root. The manifest names the file the LMS should launch. A mismatch between the manifest and the real files is a common cause of blank or failed launches.

## Modes and config

- Unconfirmed: no public page lists config files or keys for LMS, preview, or standalone mode.
- 2013 (Bravais 2.1 news, see Sources): Xyleme added a "Bravais Cloud Player". In that model each SCORM course is stored once in a Xyleme cloud repository. Each LMS launches it from there. The article also mentions SAML single sign-on and delivery through a CDN.
  - This means a cloud-player export may call back to Xyleme servers at launch. That is a 2013 claim, not checked against current products.
- 2026 product pages (MadCap FAQ): the platform is SaaS. Customers pick a data region (US or EU). A "content delivery service" is mentioned as one of two LMS delivery methods. The other method is plain package upload.
  - Whether a package from the upload method still calls home is unconfirmed.
- Unconfirmed: whether analytics or tracking calls go to a Xyleme host in any mode.

## Known LMS problems

- Unconfirmed, from search snippets only: an Articulate community reply (about Storyline content, not Xyleme) says SCORM 1.2 tracking reaches a Xyleme LMS only if the package is published as SCORM 1.2 and imported as 1.2. Fix suggested: publish as 1.2 and set tracking and completion in publish settings. I could not open the thread, so this is weak.
- Generic SCORM launch problems (not Xyleme-specific, from search snippets only):
  - Package downloads instead of launching. Likely a content-type or launch setting on the LMS side.
  - Blank page for the learner. Check the manifest first.
  - Launch fails after a course update because the LMS keeps old learner data. Fix: reset or re-enrol the learner.
  - Test the package in SCORM Cloud. If it works there and fails in the LMS, the problem is likely the LMS. If it fails there too, the package is the problem.
- Unconfirmed: no Xyleme-specific known-issue list was found.

## Export settings

- MadCap FAQ (2026, see Sources) lists output types as HTML5, SCORM 1.2, SCORM 2004 and AICC. It also says the platform can work with any SCORM 1.2 or SCORM 2004 LMS. These claims are from a MadCap page, so they may not match Xyleme exports.
- Unconfirmed: whether Xyleme's own export offers single or multi-SCO packaging, launch options, or tracking choices.
- Unconfirmed: the default SCORM version Xyleme uses for LMS exports.
- Generic guidance (not Xyleme-specific): SCORM 1.2 has the widest LMS support. SCORM 2004 is used when the LMS requires it.

## Detection hints

These are generic. None is confirmed as a Xyleme marker.

- `imsmanifest.xml` at package root (any SCORM package).
- Strings to search for in files: `Xyleme`, `Bravais`, `SyndicateAI`, `Syndicate`. Confirm against a real export before trusting any hit.
- A launch file that is very small and points to a remote content location. This is one vendor's model, not Xyleme's. Unconfirmed for Xyleme.
- Remote calls to a Xyleme or MadCap host in the package code. Unconfirmed.

## How Package Lab uses this

The pack can't rely on any Xyleme file name, so it recognises the strings in the detection hints above, or a request to a Xyleme host in a run. Its rules use what Package Lab records for any package: requests to the host's root (the Server needs view), content that builds its own API, and a small launch page that fetches from another site (a cloud-player style launch). All static rules are info (a known pattern, not confirmed). Run rules are confirmed in the run, and are info too unless a request names a Xyleme or Bravais host. A package with no marker can be given the pack with the Authoring tool option (`--tool xyleme`). Next steps point to Discover, pins and answers. Nothing here assumes a Xyleme file layout.

## Sources

Pages I actually read:

https://www.madcapsoftware.com/products/create/faq/
https://docs.stackone.com/integration-guides/lms/content-library-and-lxps/xyleme.md
https://learningnews.com/news/xyleme/2013/xyleme-drastically-improves-scorm-publishing-with-the-release-of-bravais-21-

Notes on sources:
- The xyleme.com/faq address redirected to the MadCap page above. I did not read xyleme.com directly.
- The StackOne page only says its legacy docs moved. It had no Xyleme detail.
- Several other search results (Articulate community forums, SAP knowledge base) were not readable (HTTP 403) or only seen as snippets. They are not listed here.
