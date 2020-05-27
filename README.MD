# MangaBox

It's an [electronjs](https://www.electronjs.org/) app to read manga on sites like [mangadex.org](https://mangadex.org) 
using bigger cache. 

## Problem

Images usually end up as big files. If we take 1 chapter of 25 pages and say each page is 200Kb total then total size 
can go up to 5 Mb. Now most modern browsers are chromium based. Chromium has hardcoded cache limit of 2Gb and it will be
shared across everything that is downloaded according to cache rules including css, js, images, audio, video, etc.
Also it uses less RAM.

## Implemented solution

To each BrowserView attached a NetworkWatcher. NetworkWatcher will observe network activity according to rules
specified by MangaSite class or it's children. This includes rules to cache and emit events on both Request and Response.

Caching is roughly made same as private cache described on [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching).
The only header that yet to be taking care of is **Vary**. Cache is very aggressive and will go for most cases except
those that will have **Cache-Control: no-store** or **Set-Cookie** headers. Before each request is made NetworkWatcher
will try to check if such request was made before and even revalidate it. Upon getting Response it will store cached 
response if needed.

Response info is stored in sqlite db. As of now it contains url, path, info (headers, expired time, etc) and stored flag.
Stored flag generally means if you should resolve path based on `cache` folder (false) or `manga` folder (true). 
If file is not stored it's name would be equal to primary key.   
 
## Bonus

As of now some bonus features for mangadex site are:

- Manga library. Go to title manga page, e.g. [Mashle](https://mangadex.org/title/44976/mashle). You will see **Add** at the top right corner.

- Auto checking updates for manga in library.

- Adding `--noshow` flag will start app in tray.

- `Save` toggle in library. Will move files from `cache` folder to `manga` folder.

## Installation

```bash
npm install
npm run build
# or to run dev version
npm run dev
```

#### p.s.

- Currently tested and works on win10

- UI isn't finished so, to completely exit app use "exit" inside tray context menu.

- Paths to `cache`\\`manga`\\`sqlite` db can be set with `config.json`. See `main.js`. 
