import { drainImages } from './workshop-images.ts';
// This process owns only the workshop image queue; other art stores are untouched.
await drainImages();
