# Building the target list

## Who goes on the list

A course is a target when **all** of these are true:

1. **Public.** Daily-fee, municipal (town, village, city), or county. Not a private club, not a resort
   whose tee times are sold through its hotel.
2. **Someone at the course decides.** A pro, a manager or an owner who can say yes. For a county
   system, a named golf or parks director.
3. **Its booking today is weak or costs it something.** Ranked best target first:
   - phone only, or an automated phone line;
   - a marketplace that lists or sells its times (GolfNow, TeeOff, a "golf pass" deal) with no tee sheet
     of its own;
   - a basic online tee sheet with no payments, no members, no register;
   - a full golf POS it pays for (foreUP, Lightspeed/Chronogolf, Club Caddie) — lowest priority; they
     have the most to switch.
4. **Reachable.** Within a drive of Cam for the first ten courses (see plan.md).

**Signals that move a course up:** a muni with a resident rate (residents are built in), several
courses under one owner (the course-group page), an existing member list (Members → Import a list
takes a CSV), a pro shop at the counter (the register and card reader), a website that says "call to
book".

**Signals that move it down:** a recent switch to a new system, a big marketplace partnership the course
advertises, a management company running it (the decision is elsewhere), closed or for sale.

## How to find them

1. Start from county and tourism lists (sources below) and the state golf association's club directory.
2. Open each course's own website. Note: name, city, website, how the site says to book (a "Book now"
   button and whose system it opens, a phone number only, a GolfNow link).
3. Find the general manager or head pro **by role** from the course's own website ("Contact the pro
   shop", "Golf course manager"). Use only what the course publishes for business enquiries — the pro
   shop line, a general inbox. Do not look up or store personal emails or mobile numbers of
   individuals.
4. For a town or county course, the recreation or parks department's published contact is the right
   one for email 1; the pro shop phone is the right one for the call.

Keep the list outside the repo (it will hold names of contacts). This file only holds the method and
the public examples below.

## Pilot region — 26 example listings, 36 public courses (Hudson Valley NY + Bergen County NJ)

Public listing data only, gathered 2026-11-10. **Booking systems come from third-party listings and
news articles, several of them years old — confirm on each course's own site before the first touch.**
"Website" is filled only where an official site was found; "to confirm" means find the course's own
site at list-building time.

| # | Course | City | Owner / type (as listed) | Website | Booking today (as listed) |
|---|---|---|---|---|---|
| 1 | Tarry Brae Golf Course | South Fallsburg | Town of Fallsburg (muni) | townoffallsburg.com | Phone; GolfNow listing |
| 2 | Lochmor Golf Course | Loch Sheldrake | Town of Fallsburg (muni) | townoffallsburg.com | Phone |
| 3 | Twin Village Golf Course | Roscoe | Town of Rockland (muni, acquired 2024) | townofrocklandny.gov | Not shown |
| 4 | Sullivan County Golf Club | Liberty | Daily fee, 9 holes | to confirm | Not shown |
| 5 | Swan Lake Golf & Country Club | Swan Lake | Daily fee | to confirm | Not shown |
| 6 | Philip J. Rotella Memorial Golf Course | Thiells | Town of Haverstraw (muni) | townofhaverstraw.org | Automated phone line + an online link; GolfNow deal listed |
| 7 | Spook Rock Golf Course | Suffern | Public (owner to confirm) | to confirm | GolfNow (per a review) |
| 8 | Stony Ford Golf Course | Campbell Hall | Orange County (county) | orangecountynyparks.com | Online via the county parks site; GolfNow-powered listing |
| 9 | Hickory Hill Golf Course | Warwick | Orange County (county) | orangecountynyparks.com | Same as Stony Ford |
| 10 | Wallkill Golf Club | Middletown | Daily fee | to confirm | Not shown |
| 11 | Scenic Farms Golf Course | Middletown | Daily fee | to confirm | Not shown |
| 12 | Green Ridge Golf Club | Johnson | Daily fee | to confirm | Not shown |
| 13 | Winding Hills Golf Club | Montgomery | Daily fee | to confirm | Not shown |
| 14 | McCann Memorial Golf Course | Poughkeepsie | Public muni | to confirm | Phone; golf-pass deals listed; no online booking per GolfLink |
| 15 | College Hill Golf Course | Poughkeepsie | Municipal, 9 holes | to confirm | Not shown |
| 16 | Vassar Golf Course | Poughkeepsie | Public, on Vassar College campus, 9 holes | to confirm | Not shown |
| 17 | Fishkill Golf Course & Driving Range | Fishkill | Public | to confirm | Not shown |
| 18 | Beekman Golf Course | Hopewell Junction | Public, 18 holes | to confirm | Not shown |
| 19 | Apple Greens Golf Course | Highland | Public | to confirm | Not shown |
| 20 | Wiltwyck Golf Club | Kingston | Public since 2018 | to confirm | Not shown |
| 21 | Lazy Swan Golf & Country Club | Ulster County | Public | to confirm | Not shown |
| 22 | Putnam County Golf Course | Mahopac | Putnam County (county) | to confirm | Not shown |
| 23 | Garrison Golf Club | Garrison | Public | to confirm | Not shown |
| 24 | Centennial Golf Club | Carmel | Public | to confirm | Not shown |
| 25 | Westchester County golf (6 courses: Dunwoodie, Sprain Lake, Maple Moor, Saxon Woods, Hudson Hills, Mohansic) | Yonkers, White Plains, Scarsdale, Ossining, Yorktown Heights | Westchester County (county system) | golf.westchestercountyny.gov | Online for non-Park-Pass holders, or by phone; walk-ups taken |
| 26 | Bergen County golf (6 courses: Darlington, Orchard Hills, Overpeck, Rockleigh, Soldier Hill, Valley Brook) | Mahwah, Paramus, Teaneck, Rockleigh, Emerson, River Vale | Bergen County NJ (county system) | golfbergencounty.com | Own online system, registered golfers, 7 days ahead (opens 7 PM) |

Rows 25 and 26 are county systems (12 courses between them; 24 single-course rows + 12 = 36 courses). They are
the course-group case and a long sale — see plan.md, priority 3. Bergen County is also the model the
course-group page was built after.

Rockland Lake State Park's two courses are state-run and left off: state procurement is out of reach for now.

## Sources

- News12, guide to Hudson Valley public golf courses — https://hudsonvalley.news12.com/guide-hudson-valley-public-golf-courses
- Westfair Online, "Golf without the initiation fee" — https://westfaironline.com/26176/golf-without-the-initiation-fee/
- Destination Dutchess, golf listings — https://destinationdutchess.com/listings/golf-listings
- Stymie course directory (Dutchess, Ulster, Sullivan) — https://stymie.golf/golf-courses/new-york/dutchess-county-county
- Warwick Advertiser, Orange County courses — https://www.warwickadvertiser.com/news/sports/challenging-and-scenic-courses-make-orange-county-a-destination-for-golfers-JQWA20170513170519990
- Chronicle, Stony Ford and Hickory Hill opening — https://chroniclenewspaper.com/news/sports/golf-stony-ford-and-hickory-hill-golf-courses-set-to-open-DJ1568126
- Chronogolf listings, Stony Ford and Hickory Hill — https://chronogolf.com/club/stony-ford-golf-course
- GolfLink, McCann Memorial rates and tee times — https://www.golflink.com/golf-courses/ny/poughkeepsie/mccann-memorial-golf-course-801745/rates-tee-times
- Town of Fallsburg, Lochmor — https://www.townoffallsburg.com/238/Lochmor-Golf-Course
- GolfLink, Tarry Brae — https://www.golflink.com/golf-courses/ny/south-fallsburg/tarry-brae-municipal-golf-course-826245/rates-tee-times
- Town of Haverstraw, Rotella — https://townofhaverstraw.org/rotella.html
- Town of Rockland, course hours — https://www.townofrocklandny.gov/?p=3468
- GolfPass, Spook Rock — https://www.golfpass.com/travel-advisor/courses/9773-spook-rock-golf-course
- Westchester County, 2026 season press release — https://parks.westchestercountyny.gov/press-releases/westchester-county-golf-courses-to-open-for-the-2026-season
- Bergen County, our courses — https://golfbergencounty.com/our-courses ; registration — https://www.golfbergencounty.com/registration
- Ulster County golf guide — https://visitulstercountyny.com/wp-content/uploads/2022/05/Ulster-County-Golf-Guide.pdf
