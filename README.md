# LPU TV

LPU TV is a campus-only social and random video chat platform inspired by OmeTV, built for Lovely Professional University students. It combines verified student onboarding, random one-to-one video matching, friend requests, direct messaging, and moderation tools into a single full-stack app.

The project is designed as a practical student product MVP:

- real authentication flows
- live Socket.IO-powered interactions
- ZEGOCloud-based video calling
- friend and chat system
- report/block moderation features
- blocked-user management inside settings

## What The Project Does

LPU TV allows students to:

- create an account using LPU-friendly credentials
- sign in with password, OTP, or Google
- discover other students
- send and accept friend requests
- chat with accepted friends
- enter a random matching queue
- get paired into one-to-one video conversations
- add a user as a friend during a live call
- report or block users during a live call
- manage blocked users from profile/settings

## Core Experience

The app has two main social layers:

1. Structured social layer

- discover students
- send friend requests
- accept requests
- chat with friends

2. Live random layer

- join the random queue
- get matched with another student
- open a ZEGOCloud one-on-one room
- continue to next match
- moderate the interaction instantly if needed

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- Axios
- GSAP
- Lucide React

### Backend

- Node.js
- Express
- TypeScript
- Socket.IO
- JWT authentication
- Prisma ORM
- SQLite

### Video / Realtime

- ZEGOCloud UI Kit Prebuilt
- Socket.IO for queue, match, and messaging events

### Auth / Communication

- Email OTP flow
- Google sign-in
- Nodemailer SMTP integration

## Folder Structure

```text
LPUTV/
├─ client/                 # React frontend
│  ├─ src/
│  │  ├─ components/
│  │  ├─ lib/
│  │  ├─ styles.css
│  │  └─ types.ts
├─ server/                 # Express + Socket.IO + Prisma backend
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  └─ migrations/
│  └─ src/
│     ├─ index.ts
│     ├─ socket.ts
│     ├─ auth.ts
│     ├─ otp.ts
│     └─ utils.ts
├─ package.json
└─ README.md
```

## Authentication Flows

The project supports multiple login and signup paths:

### 1. Email + Password Registration

- user requests OTP
- OTP is sent to email
- user verifies OTP
- account is created with password

### 2. OTP Login

- existing user requests login OTP
- user enters OTP
- access granted without password

### 3. Password Login

- existing email + password

### 4. Google Login

- Google credential is verified on backend
- first-time Google signup still captures student metadata

## Random Video Matching Flow

The random chat flow is handled with Socket.IO and ZEGOCloud.

### Matching flow

1. User joins the random queue
2. Server checks waiting queue
3. If another valid user exists, server creates a room payload
4. Both users receive `match:found`
5. Frontend mounts `VideoRoom`
6. ZEGOCloud joins a one-on-one room
7. User can stop, skip, add friend, report, or block

### Important queue logic

- blocked users are skipped during matching
- leaving room clears active match state
- disconnect also clears match state
- next match immediately re-enters queue

## Friend System

The structured social layer includes:

- discover feed
- friend request creation
- request acceptance
- friendship persistence in Prisma
- chat access only for accepted friends

The random call screen also lets users:

- send a friend request during a live call
- accept an incoming request if one already exists

## Messaging System

Friend-only messaging is implemented with:

- Socket.IO event: `message:send`
- room join via `join:conversation`
- server-side friendship validation
- Prisma persistence for messages

## Moderation Features

Moderation is now a first-class part of the app.

### Report user

Users can report another user during a live random call with:

- reason selection
- optional details
- backend persistence in `UserReport`

### Block user

Users can block another user during a live random call.

Blocking does the following:

- immediately removes that user from the current call
- removes friendship if it exists
- deletes any pending friend requests between the pair
- prevents future random matching between them
- removes them from discover/friends/request views where relevant

### Blocked users settings panel

Users can manage blocked users from profile/settings:

- list of blocked users
- stored reason
- unblock action

## Database Models

The current Prisma schema includes:

- `User`
- `EmailOtp`
- `FriendRequest`
- `Friendship`
- `Message`
- `UserBlock`
- `UserReport`

## API Summary

### Auth / account

- `POST /api/auth/request-otp`
- `POST /api/auth/check-otp`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/login-otp`
- `POST /api/auth/google`
- `GET /api/me`

### Social

- `GET /api/discover`
- `GET /api/friends`
- `GET /api/friend-requests`
- `POST /api/friend-requests`
- `POST /api/friend-requests/:id/accept`
- `GET /api/messages/:otherUserId`

### Relationships / moderation

- `GET /api/relationships/:otherUserId`
- `GET /api/blocked-users`
- `POST /api/users/:id/report`
- `POST /api/users/:id/block`
- `DELETE /api/users/:id/block`

### Video config

- `GET /api/zego-config`

## Socket.IO Events

### Messaging

- `join:conversation`
- `message:send`
- `message:new`
- `message:error`

### Random matching

- `match:join-queue`
- `match:waiting`
- `match:found`
- `match:leave-queue`
- `match:leave-room`
- `match:partner-left`

### Notifications

- `notification:new`

## UI Notes

The random chat UI is intentionally split into:

- top identity/action area
- central video stage
- bottom custom controls

The app uses custom `Stop` and `Next` controls outside ZEGOCloud’s default room controls to make the experience feel more branded and consistent with the rest of the product.

## Major Challenges Faced

This project had several real integration challenges.

### 1. ZEGOCloud UI Kit lifecycle issues

One of the hardest problems was stabilizing the ZEGOCloud UI Kit in React.

Issues faced:

- cleanup crashes during unmount
- development-time double effect execution under `React.StrictMode`
- video room tearing down while the SDK was still initializing
- prebuilt UI rendering unwanted internal controls

Fixes used:

- safe destroy timing
- delayed room reveal
- DOM mutation handling for transient ZEGO UI
- hiding conflicting built-in controls
- keeping custom app controls outside the SDK

### 2. Camera handoff problems

Switching from preview camera to ZEGO room camera caused:

- `NotReadableError`
- blank local previews
- temporary camera lock conflicts

Fixes used:

- staged preview lifecycle
- delayed mount before room init
- retry logic for preview acquisition
- avoiding unnecessary extra `getUserMedia` calls

### 3. Browser autoplay / resume issues

Browsers often block media autoplay.

Symptoms included:

- resume popups
- delayed audio/video playback
- inconsistent mobile behavior

Mitigation:

- transition buffering
- observer-based resume handling
- custom UI that hides the technical room-joining feel from users

### 4. Matching + moderation interaction

Adding block/report to a live queue-based system required backend coordination.

We had to ensure:

- blocked users never rematch
- active matches are cleared properly
- current calls end immediately on block
- friend/message state remains consistent

### 5. Cross-browser behavior

Behavior differed between:

- Chrome
- Edge
- mobile emulation

This especially affected:

- ZEGO control rendering
- room overlays
- autoplay
- live badge/mic indicator presentation

## Design Decisions

Some decisions are intentionally pragmatic because this is a real MVP:

- SQLite for simple local development
- Prisma for fast schema changes and migrations
- ZEGOCloud Prebuilt UI for faster video integration
- Socket.IO queue instead of a more complex matching service
- moderation tools built directly into the random-call surface

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `server/.env`:

```env
PORT=4000
CLIENT_URL=http://localhost:5173
JWT_SECRET=any_long_random_secret_here
DATABASE_URL="file:./prisma/dev.db"
ZEGO_APP_ID=your_numeric_app_id
ZEGO_SERVER_SECRET=your_zego_server_secret
GOOGLE_CLIENT_ID=your_google_client_id
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_google_app_password
MAIL_FROM="LPU TV <your_email@gmail.com>"
```

Create `client/.env`:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### 3. Generate Prisma client

```bash
npm run prisma:generate
```

### 4. Run migrations

```bash
npm run prisma:migrate
```

### 5. Start both apps

```bash
npm run dev
```

### 6. Open the frontend

```text
http://localhost:5173
```

## Build Commands

### Client type/build

```bash
npx tsc -b
```

### Server build

```bash
npm run build --workspace server
```

### Full project build

```bash
npm run build
```

## Security Notes

This project is a student MVP, but there are important production concerns.

### Current dev shortcut

For local development, `/api/zego-config` returns the ZEGO server secret to the frontend so the client can create a test token.

That is acceptable only for:

- local development
- demos
- internal prototypes

It is not production-safe.

### For production you should

- generate ZEGO room tokens on the backend only
- never expose `ZEGO_SERVER_SECRET` to the client
- add proper rate limiting
- add abuse detection
- improve moderation review workflows
- harden session handling
- rotate secrets if they were ever exposed

## Current Status

The project currently supports:

- verified login flows
- student discovery
- friend requests
- direct messaging
- random video matching
- live in-call friend/report/block actions
- blocked user management in settings

## Future Improvements

- better random match preferences
- richer user profiles
- message history polish
- admin moderation dashboard
- safer ZEGO token generation flow
- production deployment setup
- analytics and abuse monitoring
- better mobile-specific call layout

## Summary

LPU TV is a full-stack campus social/video platform that goes beyond a simple demo. It combines authentication, discovery, messaging, live random matching, video calling, and moderation into one student-focused product.

The hardest part of the project was not basic CRUD or routing, but making multiple real-time systems work together:

- React UI
- Socket.IO queue logic
- Prisma state
- ZEGOCloud video lifecycle
- moderation state transitions

That integration complexity is the real substance of the project, and it is what makes this codebase a meaningful end-to-end engineering build rather than just a frontend mockup.
