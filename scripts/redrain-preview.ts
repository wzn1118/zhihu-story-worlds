import express from 'express';
import {createApp} from '../server/app.ts';
import { artPrivateFileGuard } from '../server/art-production.ts';
import { liveGeneratedArt } from '../server/live-generated-art.ts';
const app=createApp();
app.use(artPrivateFileGuard);
app.use('/generated-art', liveGeneratedArt());
app.use('/games/redrain',express.static('public/games/redrain'));
app.use(express.static('output/redrain-build-code'));
app.use(express.static('public'));
app.get('/{*path}',(_q,r)=>r.sendFile('index.html',{root:'output/redrain-build-code'}));
app.listen(4194,'127.0.0.1',()=>console.log('RedRain preview http://127.0.0.1:4194'));

