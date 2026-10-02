# Homepage entrance and chapter transitions

The hero artwork now settles once over 1.4 seconds instead of drifting continuously. Existing heading, subtitle and CTA enter in sequence over 0.75 seconds, with 0.1/0.2 second offsets. Chapter entrances travel 16px instead of 30px and settle sooner. Content, six-scene structure, destinations and layout remain unchanged.

The CTA animation releases its transform after entry so hover feedback still works. Mobile artwork retains its existing 0.7 opacity. The existing reduced-motion override disables the new animations and transitions immediately.

Validation: all 89 existing Node tests pass; syntax, database boundary and MV3 checks pass; Vite production build succeeds. Browser checks cover desktop (1440×900), mobile (390×844) and reduced motion: six sections, hero visibility, navigation through all chapters, mobile menu closure, horizontal bounds and no JavaScript page errors. Production output is committed under public/ for the existing GitHub Integration. The Vite bundle-size warning remains; this change adds no dependencies.

Production publication must occur only through the existing GitHub Integration after merging into main. No direct Cloudflare deployment or production resource changes are part of this task.
