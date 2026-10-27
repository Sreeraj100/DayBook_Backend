# Daybook API

Express, TypeScript, and MongoDB API for Daybook. The API is deployed separately from the Vite frontend.

## Deploy to Render

1. Push this repository (`DayBook_Backend`) to GitHub and create a Render **Blueprint** from it. `render.yaml` configures the Node web service, health check, production variables, and a persistent disk for private calendar uploads. The attached disk requires a paid Render web service; without durable storage, uploaded calendar images would be lost on restarts or deploys.
2. Create a MongoDB Atlas database on a replica set (the recurring Todo feature uses transactions). Set its connection string as `MONGODB_URI` in Render. Permit Render's outbound connections in the Atlas network settings and use a database user limited to this application's database.
3. Set `FRONTEND_ORIGIN` in Render to the exact Vercel production origin, for example `https://your-daybook.vercel.app`. Multiple exact origins can be comma-separated if preview deployments are explicitly needed.
4. Keep the generated `SESSION_SECRET`. Set `AI_PROVIDER=gemini` and `AI_API_KEY` only if you want grammar suggestions; otherwise the API runs with AI disabled (`mock`).
5. Wait for `/api/health` to report healthy before using the frontend.

The Vercel configuration proxies `/api/*` through the frontend origin to `https://daybook-api.onrender.com`. If Render assigns a different service hostname, update the destination in the frontend repository's `vercel.json` before deploying the frontend. This same-origin proxy preserves the session cookie and avoids browser third-party-cookie blocking.

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Yes in production | Set to `production`; enables secure cookies and proxy trust. |
| `PORT` | Supplied by Render | HTTP port. |
| `MONGODB_URI` | Yes | MongoDB Atlas URI; use a replica-set cluster for transaction support. |
| `SESSION_SECRET` | Yes | Unique random secret of at least 32 characters. Render generates one from the Blueprint. |
| `FRONTEND_ORIGIN` | Yes | Exact Vercel origin(s), comma-separated. |
| `CALENDAR_UPLOAD_DIR` | Render Blueprint | Private uploaded image directory on the persistent disk. |
| `AI_PROVIDER` | No | `mock` disables AI, `gemini` enables Gemini. |
| `AI_MODEL` | No | Gemini model name. |
| `AI_API_KEY` | Only for Gemini | Server-side provider key; never use a `VITE_` prefix. |

For local development, copy `.env.example` to `.env`, run MongoDB locally, then use `npm install` and `npm run dev` from this repository. The app creates Mongoose indexes at startup. Back up MongoDB and the persistent `storage` directory together; calendar image metadata is stored in MongoDB while image contents are on disk.

**Credential cleanup:** a local `.env` had previously been committed in this repository. It is now removed from the current Git index and ignored, while your local file is kept on disk. Git history still contains earlier versions. That file had non-empty `SESSION_SECRET` and `AI_API_KEY` values; rotate both before deployment. Treat `MONGODB_URI` as potentially credentialed and rotate its database password if it contains one. Rewriting published history is a separate coordinated step.

## Checks

```sh
npm ci
npm test
npm run lint
npm run build
```

Database-backed tests need a configured MongoDB replica set; the service unit tests do not claim to replace production integration testing.
