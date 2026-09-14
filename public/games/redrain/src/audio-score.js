const freezeTrack = track => Object.freeze({
  ...track,
  fallbackSrc: track.src.replace(/\.ogg$/, ".mp3"),
  fallbackFormat: "mp3",
  instruments: Object.freeze([...track.instruments])
});

const orchestra = [
  "piano", "violins", "violas", "celli", "French horns", "oboe",
  "flute", "harp", "timpani", "bassoon", "brass", "orchestral percussion"
];

export const AUDIO_TRACKS = Object.freeze({
  rewind: freezeTrack({
    id: "rewind", title: "回到十二月三日", tempo: 68, bars: 16, duration: 56.47,
    key: "C minor", src: "./public/audio/orchestral/rewind.ogg", format: "ogg-vorbis", instruments: orchestra
  }),
  watch: freezeTrack({
    id: "watch", title: "二十楼的灯", tempo: 78, bars: 16, duration: 49.23,
    key: "D minor", src: "./public/audio/orchestral/watch.ogg", format: "ogg-vorbis", instruments: orchestra
  }),
  pursuit: freezeTrack({
    id: "pursuit", title: "越过封锁线", tempo: 104, bars: 16, duration: 36.92,
    key: "E minor", src: "./public/audio/orchestral/pursuit.ogg", format: "ogg-vorbis", instruments: orchestra
  }),
  collapse: freezeTrack({
    id: "collapse", title: "门把落下", tempo: 60, bars: 16, duration: 64,
    key: "C-sharp minor", src: "./public/audio/orchestral/collapse.ogg", format: "ogg-vorbis", instruments: orchestra
  }),
  dawn: freezeTrack({
    id: "dawn", title: "黎明以后", tempo: 72, bars: 16, duration: 53.33,
    key: "E-flat major", src: "./public/audio/orchestral/dawn.ogg", format: "ogg-vorbis", instruments: orchestra
  })
});

export const DEFAULT_AUDIO_TRACK = "rewind";

export function getAudioTrack(id) {
  return AUDIO_TRACKS[id] || AUDIO_TRACKS[DEFAULT_AUDIO_TRACK];
}

export function selectAudioSource(track, media) {
  // Older Safari releases cannot decode Vorbis; keep the original mix for
  // browsers that can, and use the bundled MP3 without a failed OGG download.
  const oggSupport = typeof media?.canPlayType === "function"
    ? media.canPlayType('audio/ogg; codecs="vorbis"')
    : "maybe";
  return oggSupport === "probably" || oggSupport === "maybe"
    ? { src: track.src, format: track.format }
    : { src: track.fallbackSrc, format: track.fallbackFormat };
}
