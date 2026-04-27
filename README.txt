LPU TV - Problems Faced & Solutions

================================================================================
TECH STACK
================================================================================

Frontend:
- React, TypeScript, Vite, React Router, Axios, GSAP, Lucide React

Backend:
- Node.js, Express, TypeScript, Socket.IO, JWT, Prisma ORM, SQLite

Video/Realtime:
- ZEGOCloud UI Kit Prebuilt, Socket.IO

Auth/Communication:
- Email OTP flow, Google sign-in, Nodemailer SMTP

================================================================================
PROBLEMS FACED & FIXES
================================================================================

1. ZEGOCloud UI Kit Lifecycle Issues
--------------------------------
Problem:
- Cleanup crashes during unmount
- Development-time double effect execution under React.StrictMode
- Video room tearing down while SDK was still initializing
- Prebuilt UI rendering unwanted internal controls

Fixes:
- Safe destroy timing with useEffect cleanup
- Delayed room reveal
- DOM mutation handling for transient ZEGO UI
- Hiding conflicting built-in controls via CSS
- Keeping custom app controls outside the SDK

2. Camera Handoff Problems
-----------------------
Problem:
- NotReadableError when switching from preview to ZEGO room
- Blank local previews
- Temporary camera lock conflicts

Fixes:
- Staged preview lifecycle
- Delayed mount before room init
- Retry logic for preview acquisition
- Avoiding unnecessary extra getUserMedia calls

3. Browser Autoplay / Resume Issues
----------------------------
Problem:
- Browsers block media autoplay
- Resume popups appearing
- Delayed audio/video playback
- Inconsistent mobile behavior

Fixes:
- Transition buffering
- Observer-based resume handling
- Custom UI that hides technical room-joining feel

4. Matching + Moderation Interaction
--------------------------------
Problem:
- Block/report in live queue-based system required backend coordination
- Blocked users must never rematch
- Active matches must clear properly
- Friend/message state must remain consistent

Fixes:
- Backend queue filtering excludes blocked users
- Active matches cleared on block
- Immediate call end on block
- Friendship removal on block
- Friend request deletion on block

5. Cross-Browser Behavior
---------------------
Problem:
- Different behavior between Chrome, Edge, mobile emulation
- ZEGO control rendering differences
- Room overlays inconsistent
- Autoplay policies vary
- Live badge/mic indicator presentation

Fixes:
- CSS targeting for different browsers
- Feature detection for capabilities
- Fallback UI where needed

================================================================================
HOW PROBLEMS WERE TACKLED
================================================================================

1. ZEGOCloud Integration:
- Studied ZEGOCloud documentation thoroughly
- Used UI Kit Prebuilt for faster integration
- Built custom wrapper component for lifecycle control
- Implemented strict cleanup patterns

2. Camera Handling:
- Created separate preview component before room
- Added delays and retry logic
- Managed getUserMedia calls carefully
- Used refs to track initialization state

3. Moderation System:
- Built block/report directly into call surface
- Created backend queue filtering
- Implemented immediate state cleanup
- Added UserBlock model in Prisma schema

4. Real-time Queue:
- Used Socket.IO for queue events
- Created proper waiting logic
- Implemented match:found payload
- Handled partner disconnects gracefully

5. Testing:
- Tested across Chrome, Edge, mobile
- Handled different browser behaviors
- Added proper error boundaries

================================================================================
SUMMARY
================================================================================

The hardest part was making multiple real-time systems work together:
- React UI
- Socket.IO queue logic
- Prisma state
- ZEGOCloud video lifecycle
- Moderation state transitions

This required careful lifecycle management, proper cleanup patterns,
and coordination between frontend, backend, and video SDK.