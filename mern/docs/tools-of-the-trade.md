# Tools of the Trade

Branch: `feat/tools-of-the-trade-20261021`, based on production commit `39969fbca8b5582e6873608584ff0904e46a7aec`.

The public `/tools-of-the-trade` page presents the five user-supplied products with locally served photographs, original short descriptions and the original Amazon purchase links. The page leads with **“We assess your dog first. We only use the tools your dog needs.”** The introduction identifies these as tools for Bravo’s basic through advanced obedience courses and training. It explains that not every dog needs every tool and asks clients to speak with Bravo about suitability, fit and use before purchasing.

## Verified listings

Verified by following the supplied short links and reading their Amazon product pages on October 21, 2026. Images are the corresponding listing photographs, downloaded without alteration at the listing's offered 679-pixel width. No product prices are copied or promises of training outcomes made.

| Tool | Listing / ASIN | Supplied purchase link | Photo source |
| --- | --- | --- | --- |
| Prong collar | Supet Prong Collar / B07RXBGB87 | https://a.co/d/0cWLPuAY | https://m.media-amazon.com/images/I/71nYXiMulZL._AC_SX679_.jpg |
| E-collar | Dogtra 1900X Black Edition / B0F5KSFYFB | https://a.co/d/08SLvEQC | https://m.media-amazon.com/images/I/714PRSjmd0L._AC_SX679_.jpg |
| Budget-friendly e-collar | My Pet Command two-collar kit / B0DJFD1G3P | https://a.co/d/08BVVJuV | https://m.media-amazon.com/images/I/718vYG7H1DL._AC_SX679_PIbundle-2,TopRight,0,0_SH20_.jpg |
| Slip lead | Fida, black, 6 ft × ½ in / B08Y5RYPTS | https://a.co/d/07p2Zd9F | https://m.media-amazon.com/images/I/81TRzWgO1mL._AC_SX679_.jpg |
| Short hand leash | PetBonus Traffic Tab, army green, 12 in / B0FLTDLCGG | https://a.co/d/0bMLFa5W | https://m.media-amazon.com/images/I/51URpQCm7UL._AC_SX679_.jpg |

The added My Pet Command option is presented alongside Dogtra as a budget-friendly alternative for trainer-guided obedience work. Its two-collar/one-remote contents and tone, vibration and adjustable electronic stimulation modes were verified in the supplied listing and the [manufacturer product page](https://mypetcommand.com/products/my-pet-command-1-mile-5280-ft-long-range-dog-training-collar-safe-shock-collar). Identical performance to Dogtra has not been independently established, so the copy does not promise equivalence. The owner’s individual-dog assessment remains the basis for equipment selection.

**Length clarification outstanding:** the user requested a 6-inch hand leash, but the last supplied listing is a 12-inch model; its listed length options are 12, 18 and 24 inches. The draft labels the actual linked product as 12 inches. Confirm this selection or replace it with the intended 6-inch product before publication. Do not relabel the 12-inch photo/link as 6 inches.

## Integration and review

- The shared About Bravo menu, footer and homepage approach section link to the page. Both mobile menu controls retain their existing shared behavior.
- Public server-rendered HTML, the sitemap, canonical metadata, direct Express routing and Vercel rewrites include the new route. Existing homepage routing stays first.
- Existing owner controls can edit the new page copy, product links and photos. Existing owner keys and media remain unchanged.
- Five images total approximately 264 KB. Images have descriptive alternative text, fixed layout dimensions and `object-fit: contain`; the page uses a responsive two-column/one-column grid, pairs the e-collar choices on desktop and gives the final hand-leash card a full-width image/copy row. Product links identify Amazon and a new tab.
- No changes to booking, accounts, Stripe, memberships, credits, live streaming or the how-to video.

Local lint, production build and 251 unit tests pass. The dedicated Chromium/WebKit fixture verifies 360, 390, 768 and 1440-pixel layouts, loaded images, exact purchase links, visible assessment-first copy, keyboard focus and both mobile menu controls where present. It also checks useful product content with JavaScript disabled. It uses local synthetic API responses and blocks off-origin traffic. No purchase, booking, charge or outbound message is created.

Browser and required release results are recorded in the pull request. Production publication is separate from this draft.
