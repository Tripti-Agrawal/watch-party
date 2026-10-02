# YouTube Watch Party

Real-time YouTube Watch Party built with React, Node.js, Express, Socket.IO, MongoDB and the YouTube IFrame API.

**Live URL:** `https://YOUR-APP.onrender.com` — replace this after deployment.

## What is implemented
- Publicly deployable single-service architecture: Express serves the Vite production build.
- Register/login with JWT authentication and MongoDB-backed sessions.
- Socket.IO connections are token-authenticated before they can join rooms.
- Create/join rooms with unique six-character codes.
- MongoDB persistence for room metadata/state.
- Host, Moderator, Participant and Viewer roles with backend permission checks.
- Host can assign roles, remove participants and transfer host.
- Participants can request playback/video changes for approval.
- Synchronized play, pause, seek and video changes.
- Basic chat and reactions.
- OOP room broadcasting methods are implemented in `server/src/Room.js`.
- Client package no longer contains the stray `"watch-party": "file:.."` dependency.

## Run locally

Requires Node 18+ and MongoDB (local MongoDB or MongoDB Atlas).

```bash
npm install
npm --prefix client install
npm run dev:server
```

In a second terminal:

```bash
npm run dev:client
```

Open **http://localhost:5173**. Register a user, create a room, then open an incognito window and register a second user to test synchronization and roles.

For a production-style local test:

```bash
npm run build
npm start
```

Then open **http://localhost:4000**.

## Environment variables

Copy `.env.example` to `.env` and set:
- `MONGODB_URI` — MongoDB connection string.
- `JWT_SECRET` — long random secret used to sign login tokens.
- `CLIENT_ORIGIN` — frontend origin(s) allowed by CORS/Socket.IO. For local development it is `http://localhost:5173`.
- `PORT` — server port; Render supplies its own `PORT` automatically.

## Deploy on Render

This repository uses a **single Render Web Service**. The Node server serves `client/dist` after the client is built, so the browser needs only one public URL.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

Environment variables on Render:

```text
MONGODB_URI=<MongoDB Atlas connection string>
JWT_SECRET=<long random secret>
CLIENT_ORIGIN=<your Render URL>
```

After deployment, verify:

```text
https://YOUR-APP.onrender.com/health
```

Then replace the placeholder Live URL above with the real Render URL and commit the README change.

## Architecture

```text
React + Vite
   |
   | REST / Socket.IO
   v
Express + Socket.IO
   |
   +--> MessageHandler -> Room (state, permissions, broadcasts)
   |                       |
   |                       +--> Participant
   |
   +--> RoomManager ------> MongoDB Room
   |
   +--> Auth -------------> MongoDB User + UserSession
```

`Room` owns participant/state logic and also exposes `broadcast`, `broadcastState`, `broadcastParticipants`, and `broadcastRequests`. `MessageHandler` validates the event and asks `Room` to perform the broadcast.

## Production limitation / scalability

The assignment's Redis adapter, multiple WebSocket instances, load balancer and tuned multi-instance connection pooling are **not enabled** in this version. Those are separate scaling work and should not be claimed as implemented. A single Render instance is used for the current deployment target.
