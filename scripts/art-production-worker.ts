import { drainArtQueue } from '../server/art-production.ts';
// Durable worker is separate from the shared web server; no restart or credentials here.
await drainArtQueue();
