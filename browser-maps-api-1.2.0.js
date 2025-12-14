/**
 * Google Maps List API - Browser Console Edition
 * @version 1.2.0
 * 
 * Usage:
 *   1. Open Google Maps in browser, navigate to your list
 *   2. Open DevTools Console (F12)
 *   3. Paste this entire script
 *   4. Use MapsAPI methods
 * 
 * Quick start:
 *   await MapsAPI.importPlaces([{name, lat, lng, category, note}, ...])
 */

window.MapsAPI = (() => {
  // ========== CONFIGURATION ==========
  const CONFIG = {
    listId: null,  // Set via CONFIG.listId = 'your-list-id'
    authUser: '0',
    lang: 'en',
    region: 'il',
    maxDistance: 2,      // km - max distance to match places
    delayMs: 1000,       // ms - delay between API calls
  };

  const TOKEN_INDEX = { createItem: 8, updateItem: 10 };

  // ========== INTERNAL STATE ==========
  let _tokens = null;
  let _notFound = [];  // Accumulate places not found

  // ========== UTILITIES ==========
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const refreshTokens = () => {
    const html = document.documentElement.innerHTML;
    _tokens = html.match(/AMAbHI[A-Za-z0-9_-]+:\d+/g) || [];
    return _tokens;
  };

  const getToken = (type) => {
    if (!_tokens) refreshTokens();
    return _tokens[TOKEN_INDEX[type]];
  };

  const hexToPlaceIds = (hexId) => {
    if (!hexId || !hexId.includes(':')) return { id1: null, id2: null };
    const [hex1, hex2] = hexId.split(':');
    return {
      id1: BigInt(hex1).toString(),
      id2: BigInt.asIntN(64, BigInt(hex2)).toString()
    };
  };

  const distance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + 
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * 
              Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // ========== CORE API ==========
  
  const search = async (query) => {
    const url = new URL('https://www.google.com/search');
    url.searchParams.set('tbm', 'map');
    url.searchParams.set('authuser', CONFIG.authUser);
    url.searchParams.set('hl', CONFIG.lang);
    url.searchParams.set('q', query);

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
    
    const data = JSON.parse((await resp.text()).replace(/^\)\]\}'\n?/, ''));
    return (data[0]?.[1] || []).map(item => {
      const info = item[14];
      if (!info?.[11]) return null;
      return {
        name: info[11],
        lat: info[9]?.[2],
        lng: info[9]?.[3],
        hexId: info[10],
        ...hexToPlaceIds(info[10])
      };
    }).filter(Boolean);
  };

  const getList = async (listId = CONFIG.listId) => {
    const pb = `!1m4!1s${listId}!2e1!3m1!1e1!2e2!3e2!4i500!6m3!1sx!7e81!28e2!8i3!16b1`;
    const resp = await fetch(`https://www.google.com/maps/preview/entitylist/getlist?authuser=${CONFIG.authUser}&hl=${CONFIG.lang}&gl=${CONFIG.region}&pb=${encodeURIComponent(pb)}`);
    if (!resp.ok) throw new Error(`getList failed: ${resp.status}`);
    
    const data = JSON.parse((await resp.text()).replace(/^\)\]\}'\n?/, ''));
    return { 
      id: listId,
      name: data[0]?.[4],
      count: (data[0]?.[8] || []).length,
      places: (data[0]?.[8] || []).map(p => ({
        name: p[2],
        note: p[3],
        lat: p[1]?.[5]?.[2],
        lng: p[1]?.[5]?.[3],
        id1: p[1]?.[6]?.[0],
        id2: p[1]?.[6]?.[1]
      }))
    };
  };

  const getListByName = async (name) => {
    const lists = await getLists();
    const match = lists.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      console.log('Available lists:', lists.map(l => l.name).join(', '));
      throw new Error(`List "${name}" not found`);
    }
    return getList(match.id);
  };

  const getLists = async () => {
    // Use a pb that triggers the "save to list" panel
    const pb = '!1m17!1s0x151d4c9de840d371:0x89c37aa6e94d6bd2!3m12!1m3!1d25359!2d34.78!3d32.06!2m3!1f0!2f0!3f0!3m2!1i1280!2i720!4f13.1!4m2!3d32.05!4d34.77!13m50!2m2!1i408!2i240!3m2!2i10!5b1!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!14m4!1s3hg9aZv2CaOIhbIP_bXhiQs!3b1!7e81!15i10555!15m49!1m10!4e2!18m7!3b0!6b0!14b1!17b1!20b1!27m1!1b0!20e2!4b1!10m1!8e3!11m1!3e1!17b1!20m2!1e3!1e6!24b1!25b1!26b1!29b1!30m1!2b1!36b1!43b1!52b1!55b1!56m1!1b1!65m5!3m4!1m3!1m2!1i224!2i298!98m3!1b1!2b1!3b1!107m2!1m1!1e1!114m3!1b1!2m1!1b1!22m1!1e81!29m0!30m6!3b1!6m1!2b1!7m1!2b1!9b1!32b1!37i761';
    const resp = await fetch(`https://www.google.com/maps/preview/place?authuser=${CONFIG.authUser}&hl=${CONFIG.lang}&gl=${CONFIG.region}&pb=${encodeURIComponent(pb)}`);
    if (!resp.ok) throw new Error(`getLists failed: ${resp.status}`);
    
    const text = await resp.text();
    
    // Parse with regex: [[type,"listId"],"listName",null,visibility,null,placeCount
    const pattern = /\[\[(\d),"([A-Za-z0-9_-]{10,})"\],"([^"]+)",null,(\d),null,(\d+)/g;
    const lists = [];
    const seen = new Set();
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const id = match[2];
      if (!seen.has(id) && id.length >= 10) {
        seen.add(id);
        lists.push({
          id,
          name: match[3],
          placeCount: parseInt(match[5])
        });
      }
    }
    return lists;
  };

  /** Get starred places (special built-in list) */
  const getStarredPlaces = async () => {
    // This pb triggers the "starred places" view
    const pb = '!4m12!1m3!1d34205015.708281964!2d-3.8088220729247317!3d40.31063439697399!2m3!1f0!2f0!3f0!3m2!1i1215!2i1054!4f13.1!7i20!10b1!12m25!1m5!18b1!30b1!31m1!1b1!34e1!2m4!5m1!6e2!20e3!39b1!10b1!12b1!13b1!16b1!17m1!3e1!20m3!5e2!6b1!14b1!46m1!1b0!96b1!99b1!19m4!2m3!1i360!2i120!4i8!20m65!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0!15m16!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!22m2!1sWYE-aZnSPKyYkdUPpoCduAE!7e81!24m109!1m30!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1!18m19!3b1!4b1!5b1!6b1!9b1!13b1!14b1!17b1!20b1!21b1!22b1!27m1!1b0!28b0!32b1!33m1!1b1!34b1!36e2!10m1!8e3!11m1!3e1!14m1!3b0!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts!6m1!1e1!9b1!89b1!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!26m4!2m3!1i80!2i92!4i8!30m28!1m6!1m2!1i0!2i0!2m2!1i530!2i1054!1m6!1m2!1i1165!2i0!2m2!1i1215!2i1054!1m6!1m2!1i0!2i0!2m2!1i1215!2i20!1m6!1m2!1i0!2i1034!2m2!1i1215!2i1054!34m19!2b1!3b1!4b1!6b1!8m6!1b1!3b1!4b1!5b1!6b1!7b1!9b1!12b1!14b1!20b1!23b1!25b1!26b1!31b1!37m1!1e81!42b1!47m0!49m10!3b1!6m2!1b1!2b1!7m2!1e3!2b1!8b1!9b1!10e2!50m4!2e2!3m2!1b1!3b1!54m1!1e4!61b1!67m5!7b1!10b1!14b1!15m1!1b0!69i761';

    const url = new URL('https://www.google.com/search');
    url.searchParams.set('tbm', 'map');
    url.searchParams.set('authuser', CONFIG.authUser);
    url.searchParams.set('hl', CONFIG.lang);
    url.searchParams.set('gl', CONFIG.region);
    url.searchParams.set('pb', pb);
    url.searchParams.set('q', '*');
    url.searchParams.set('tch', '1');
    url.searchParams.set('ech', '4');

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`getStarredPlaces failed: ${resp.status}`);
    
    let text = await resp.text();
    
    // Response is wrapped: {"c":0,"d":")]}'\n[[...]]"}/*""*/
    text = text.replace(/\/\*.*\*\/\s*$/, ''); // Strip trailing /*""*/
    const wrapper = JSON.parse(text);
    const inner = wrapper.d.replace(/^\)\]\}'\n?/, '');
    const data = JSON.parse(inner);
    
    const str = JSON.stringify(data);
    
    // Find all unique hex IDs (filter out invalid ones like 0x0:...)
    const hexMatches = [...new Set(str.match(/0x[0-9a-f]+:0x[0-9a-f]+/gi) || [])]
      .filter(h => !h.startsWith('0x0:'));
    
    const places = [];
    for (const hexId of hexMatches) {
      const idx = str.indexOf(hexId);
      const after = str.substring(idx + hexId.length, idx + hexId.length + 1000);
      
      // Pattern after hexId: ","NAME",null,["types"...],...,"ADDRESS"
      const nameMatch = after.match(/^","([^"]+)"/);
      const typesMatch = after.match(/,null,\[("[^"]+(?:","[^"]+)*")\]/);
      const types = typesMatch ? typesMatch[1].split('","').map(t => t.replace(/"/g, '')) : [];
      const addressMatch = after.match(/,null,null,null,"([^"]+)"/);
      
      const { id1, id2 } = hexToPlaceIds(hexId);
      
      // Coordinates are stored near the decimal IDs: ["id1","id2"],"/g/xxx",null,[lat,lng]
      // Search for pattern with our id1
      let lat = null, lng = null;
      if (id1) {
        const coordPattern = new RegExp(`"${id1}"[^\\]]*\\],"\\/g\\/[^"]+",null,\\[(\\d{7,9}),(\\d{7,10})\\]`);
        const coordMatch = str.match(coordPattern);
        if (coordMatch) {
          lat = parseInt(coordMatch[1]) / 1e7;
          lng = parseInt(coordMatch[2]) / 1e7;
          // Fix signed integer overflow for negative longitudes (e.g., London at -0.1)
          if (lng > 180) lng = lng - 429.4967296; // 2^32 / 1e7
        }
      }
      
      const name = nameMatch?.[1];
      
      // Skip if no name found (likely not a real place)
      if (!name) continue;
      
      places.push({
        name,
        hexId,
        id1,
        id2,
        lat,
        lng,
        types,
        address: addressMatch?.[1] || null
      });
    }
    
    console.log(`\n=== Starred Places (${places.length}) ===`);
    places.forEach((p, i) => {
      console.log(`${i+1}. ${p.name}`);
      console.log(`   id1: ${p.id1}, id2: ${p.id2}`);
      if (p.lat && p.lng) console.log(`   coords: ${p.lat}, ${p.lng}`);
      if (p.types.length) console.log(`   type: ${p.types[0]}`);
    });
    
    return places;
  };

  /** Get detailed place info by hex ID */
  const getPlaceInfo = async (hexId, name = '') => {
    const pb = `!1m17!1s${hexId}!3m12!1m3!1d50000!2d139.7!3d35.68!2m3!1f0!2f0!3f0!3m2!1i500!2i500!4f13.1!4m2!3d35.68!4d139.7!12m4!2m3!1i360!2i120!4i8!13m57!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!14m2!1sxxx!7e81!15m111!1m32!4e2!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1!18m20!3b1!4b1!5b1!6b1!9b1!13b1!14b1!17b1!20b1!21b1!22b1!27m1!1b0!28b0!30b1!32b1!33m1!1b1!34b1!36e2!10m1!8e3!11m1!3e1!14m1!3b0!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother!6m1!1e1!9b1!89b1!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!21m0!22m1!1e81!29m0!30m6!3b1!6m1!2b1!7m1!2b1!9b1!34m5!7b1!10b1!14b1!15m1!1b0!37i761`;
    const url = `https://www.google.com/maps/preview/place?authuser=${CONFIG.authUser}&hl=${CONFIG.lang}&gl=${CONFIG.region}&pb=${encodeURIComponent(pb)}&q=${encodeURIComponent(name)}`;
    
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`getPlaceInfo failed: ${resp.status}`);
    
    const text = await resp.text();
    const data = JSON.parse(text.replace(/^\)\]\}'\n?/, ''));
    
    // Parse the response - structure varies but key info is usually in [6]
    const info = data[6];
    if (!info) return null;
    
    return {
      name: info[11],
      address: info[18],
      rating: info[4]?.[7],
      reviewCount: info[4]?.[8],
      priceLevel: info[4]?.[2],
      types: info[13],
      phone: info[178]?.[0]?.[0],
      website: info[7]?.[0],
      hours: info[34]?.[1],
      lat: info[9]?.[2],
      lng: info[9]?.[3],
      hexId
    };
  };

  /** Get all places in a list with detailed info */
  const getListWithDetails = async (listId = CONFIG.listId) => {
    const list = await getList(listId);
    console.log(`Fetching details for ${list.places.length} places in "${list.name}"...`);
    
    const detailed = [];
    for (let i = 0; i < list.places.length; i++) {
      const place = list.places[i];
      const pct = ((i + 1) / list.places.length * 100).toFixed(0);
      
      try {
        // Convert id1/id2 back to hex format
        const hexId = place.id1 && place.id2 
          ? `0x${BigInt(place.id1).toString(16)}:0x${(BigInt(place.id2) & BigInt('0xffffffffffffffff')).toString(16)}`
          : null;
        
        if (hexId) {
          const info = await getPlaceInfo(hexId, place.name);
          detailed.push({ ...place, details: info });
          console.log(`[${i+1}/${list.places.length} ${pct}%] ✓ ${place.name}`);
        } else {
          detailed.push({ ...place, details: null, error: 'No place ID' });
          console.warn(`[${i+1}/${list.places.length} ${pct}%] ✗ ${place.name} - no ID`);
        }
        
        await sleep(500); // Rate limit
      } catch (e) {
        detailed.push({ ...place, details: null, error: e.message });
        console.error(`[${i+1}/${list.places.length} ${pct}%] ✗ ${place.name} - ${e.message}`);
      }
    }
    
    console.log(`\nDone! ${detailed.filter(p => p.details).length}/${list.places.length} with details`);
    return { ...list, places: detailed };
  };

  const addPlace = async (place, listId = CONFIG.listId) => {
    const token = getToken('createItem');
    const { name, lat, lng, id1, id2 } = place;
    if (!id1 || !id2) throw new Error('Place missing id1/id2');
    
    // Don't encode name - it gets encoded when we encode the whole pb
    const safeName = name.replace(/!/g, '.');
    const pb = `!1m4!1s${listId}!2e1!3m1!1e1!2m17!2m7!3s${safeName}!6m2!3d${lat}!4d${lng}!7m2!1y${id1}!2y${id2}!3s${safeName}!9m7!1m1!1e1!5m4!1m2!1y${id1}!2y${id2}!2s${safeName}!3m3!1sx!7e81!28e2!4s${token}`;
    
    const resp = await fetch(`https://www.google.com/maps/preview/entitylist/createitem?authuser=${CONFIG.authUser}&hl=${CONFIG.lang}&pb=${encodeURIComponent(pb)}`);
    if (!resp.ok) throw new Error(`addPlace failed: ${resp.status}`);
    return true;
  };

  const updateNote = async (id1, id2, note, listId = CONFIG.listId) => {
    const token = getToken('updateItem');
    const safeNote = (note || '').replace(/!/g, '.');
    
    const pb = `!1m4!1s${listId}!2e1!3m1!1e1!2m7!1m5!1m1!1e1!2m2!1y${id1}!2y${id2}!2s${safeNote}!3m3!1sx!7e81!28e2!4s${token}`;
    
    const resp = await fetch(`https://www.google.com/maps/preview/entitylist/updateitem?authuser=${CONFIG.authUser}&hl=${CONFIG.lang}&gl=${CONFIG.region}&pb=${encodeURIComponent(pb)}`);
    if (!resp.ok) throw new Error(`updateNote failed: ${resp.status}`);
    return true;
  };

  // ========== HIGH-LEVEL HELPERS ==========

  /** Find a place by searching and matching coordinates */
  const findPlace = async (place) => {
    // Try Tokyo first, then Japan, then bare name
    const queries = [`${place.name} Tokyo`, `${place.name} Japan`, place.name];
    let closestMatch = null;
    let closestDist = Infinity;
    
    for (const query of queries) {
      const results = await search(query);
      
      // Find match within distance
      for (const r of results) {
        if (!r.lat || !r.lng || !r.id1) continue;
        const dist = distance(place.lat, place.lng, r.lat, r.lng);
        if (dist <= CONFIG.maxDistance) {
          r.matchDistance = dist;
          return { found: true, match: r };
        }
        // Track closest for reporting
        if (dist < closestDist) {
          closestDist = dist;
          closestMatch = r;
        }
      }
    }
    
    // Not found - build reason
    const reason = closestMatch 
      ? `too far: ${closestDist.toFixed(1)}km` 
      : 'no results';
    
    _notFound.push({
      ...place,
      reason: closestMatch ? 'distance' : 'no_results',
      closest: closestMatch ? {
        name: closestMatch.name,
        distance: closestDist.toFixed(2) + 'km'
      } : null
    });
    
    return { found: false, reason };
  };

  /** Import a single place (search + add + note) */
  const importOne = async (place, listId = CONFIG.listId) => {
    const result = await findPlace(place);
    if (!result.found) return { success: false, reason: result.reason };
    
    const match = result.match;
    await addPlace(match, listId);
    
    if (place.note || place.category) {
      const note = place.category 
        ? `[${place.category}] ${place.note || ''}`.trim()
        : place.note;
      await updateNote(match.id1, match.id2, note, listId);
    }
    
    return { success: true, match };
  };

  /** Import multiple places with progress logging */
  const importPlaces = async (places, listId = CONFIG.listId) => {
    const results = { success: [], notFound: [], failed: [] };
    const startTime = Date.now();
    
    console.log(`Importing ${places.length} places...\n`);
    
    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const pct = ((i + 1) / places.length * 100).toFixed(0);
      const elapsed = (Date.now() - startTime) / 1000;
      const perItem = elapsed / (i + 1);
      const remaining = Math.round(perItem * (places.length - i - 1));
      const eta = remaining > 60 ? `${Math.round(remaining/60)}m` : `${remaining}s`;
      
      const prefix = `[${i+1}/${places.length} ${pct}% ~${eta}]`;
      
      try {
        const result = await importOne(place, listId);
        
        if (result.success) {
          const dist = result.match.matchDistance?.toFixed(1) || '?';
          const noteIcon = (place.note || place.category) ? ' 📝' : '';
          console.log(`%c${prefix} OK ${result.match.name} (${dist}km)${noteIcon}`, 'color: #4CAF50');
          results.success.push({ original: place.name, added: result.match.name });
        } else {
          console.warn(`${prefix} SKIP ${place.name} (${result.reason})`);
          results.notFound.push(place.name);
        }
        
        if (i < places.length - 1) await sleep(CONFIG.delayMs);
        
      } catch (err) {
        console.error(`${prefix} FAIL ${place.name} - ${err.message}`);
        results.failed.push({ name: place.name, error: err.message });
      }
    }
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\nDone in ${totalTime}s`);
    console.log(`✓ ${results.success.length} | ✗ ${results.notFound.length} | ⚠ ${results.failed.length}`);
    if (results.notFound.length > 0) {
      console.log(`Run MapsAPI.reportNotFound() for details`);
    }
    return results;
  };

  /** Direct import for places that already have id1/id2 (no search needed) */
  const directImport = async (places, listId = CONFIG.listId) => {
    const results = { success: [], failed: [] };
    const startTime = Date.now();
    
    console.log(`Direct importing ${places.length} places (no search)...\n`);
    
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      const pct = ((i + 1) / places.length * 100).toFixed(0);
      const elapsed = (Date.now() - startTime) / 1000;
      const perItem = elapsed / (i + 1);
      const remaining = Math.round(perItem * (places.length - i - 1));
      const eta = remaining > 60 ? `${Math.round(remaining/60)}m` : `${remaining}s`;
      const prefix = `[${i+1}/${places.length} ${pct}% ~${eta}]`;
      
      if (!p.id1 || !p.id2) {
        console.warn(`${prefix} SKIP ${p.name} (missing id1/id2)`);
        results.failed.push({ name: p.name, error: 'missing ids' });
        continue;
      }
      
      try {
        await addPlace({ name: p.name, lat: p.lat, lng: p.lng, id1: p.id1, id2: p.id2 }, listId);
        
        const noteText = p.category ? `[${p.category}] ${p.note || ''}`.trim() : p.note;
        if (noteText) {
          await updateNote(p.id1, p.id2, noteText, listId);
        }
        
        const noteIcon = noteText ? ' 📝' : '';
        console.log(`%c${prefix} OK ${p.name}${noteIcon}`, 'color: #4CAF50');
        results.success.push(p.name);
        
        if (i < places.length - 1) await sleep(CONFIG.delayMs);
      } catch (err) {
        console.error(`${prefix} FAIL ${p.name} - ${err.message}`);
        results.failed.push({ name: p.name, error: err.message });
      }
    }
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\nDone in ${totalTime}s`);
    console.log(`✓ ${results.success.length} | ⚠ ${results.failed.length}`);
    return results;
  };

  /** Fix URL-encoded notes in a list */
  const fixEncodedNotes = async (listId = CONFIG.listId) => {
    const list = await getList(listId);
    const broken = list.places.filter(p => p.note?.includes('%'));
    
    console.log(`Fixing ${broken.length} encoded notes...`);
    
    for (const p of broken) {
      try {
        await updateNote(p.id1, p.id2, decodeURIComponent(p.note), listId);
        console.log(`  ✓ ${p.name?.substring(0, 40)}`);
        await sleep(500);
      } catch (e) {
        console.log(`  ✗ ${p.name?.substring(0, 40)} - ${e.message}`);
      }
    }
  };

  /** Get list stats */
  const stats = async (listId = CONFIG.listId) => {
    const list = await getList(listId);
    const withNotes = list.places.filter(p => p.note).length;
    const encoded = list.places.filter(p => p.note?.includes('%')).length;
    
    console.log(`List: ${list.name}`);
    console.log(`  Places: ${list.count}`);
    console.log(`  With notes: ${withNotes}`);
    console.log(`  Encoded notes: ${encoded}`);
    return list;
  };

  /** Fetch places from local server */
  const fetchPlaces = async (url = 'http://localhost:3456/places') => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
    return resp.json();
  };

  /** Fetch harakiri places (optionally filtered by category) */
  const fetchHarakiri = async (category = null) => {
    const url = category 
      ? `http://localhost:3456/harakiri?category=${category}`
      : 'http://localhost:3456/harakiri';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
    return resp.json();
  };

  /** Fetch ronny-tokyo places (optionally filtered by category) */
  const fetchRonnyTokyo = async (category = null) => {
    const url = category 
      ? `http://localhost:3456/ronny-tokyo?category=${encodeURIComponent(category)}`
      : 'http://localhost:3456/ronny-tokyo';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
    return resp.json();
  };

  /** Import places by category to a list */
  const importCategory = async (category, listId) => {
    if (!listId) throw new Error('listId required');
    const places = await fetchPlaces();
    const filtered = places.filter(p => p.category === category);
    console.log(`Found ${filtered.length} places in category "${category}"`);
    if (filtered.length === 0) return { success: [], notFound: [], failed: [] };
    return importPlaces(filtered, listId);
  };

  /** Retry not-found places with different search strategies */
  const retryNotFound = async (options = {}) => {
    const { maxDistance = 5, listId = CONFIG.listId } = options;
    const notFound = getNotFound();
    
    if (notFound.length === 0) {
      console.log('No not-found places to retry');
      return;
    }
    
    console.log(`Retrying ${notFound.length} not-found places (max ${maxDistance}km)...\n`);
    const startTime = Date.now();
    const results = { found: [], stillNotFound: [] };
    
    for (let i = 0; i < notFound.length; i++) {
      const place = notFound[i];
      const pct = ((i + 1) / notFound.length * 100).toFixed(0);
      const prefix = `[${i+1}/${notFound.length} ${pct}%]`;
      
      // Try searches without Tokyo
      const queries = [place.name, `${place.name} Japan`];
      let match = null;
      
      for (const query of queries) {
        const searchResults = await search(query);
        for (const r of searchResults) {
          if (!r.lat || !r.lng || !r.id1) continue;
          const dist = distance(place.lat, place.lng, r.lat, r.lng);
          if (dist <= maxDistance) {
            match = { ...r, matchDistance: dist, query };
            break;
          }
        }
        if (match) break;
        await sleep(300);
      }
      
      if (match) {
        try {
          await addPlace(match, listId);
          if (place.note || place.category) {
            const note = place.category ? `[${place.category}] ${place.note || ''}`.trim() : place.note;
            await updateNote(match.id1, match.id2, note, listId);
          }
          console.log(`%c${prefix} OK ${match.name} (${match.matchDistance.toFixed(1)}km via "${match.query}")`, 'color: #4CAF50');
          results.found.push({ original: place.name, added: match.name });
        } catch (e) {
          console.error(`${prefix} FAIL ${place.name} - ${e.message}`);
        }
      } else {
        console.warn(`${prefix} SKIP ${place.name} (still not found)`);
        results.stillNotFound.push(place);
      }
      
      await sleep(CONFIG.delayMs);
    }
    
    // Update _notFound with remaining
    _notFound = results.stillNotFound;
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\nDone in ${totalTime}s`);
    console.log(`✓ Found: ${results.found.length} | ✗ Still not found: ${results.stillNotFound.length}`);
    return results;
  };

  /** Full import with report - convenience wrapper */
  const runImport = async (options = {}) => {
    const { 
      listId = CONFIG.listId, 
      start = 0, 
      end = Infinity,
      showReport = true 
    } = options;
    
    CONFIG.listId = listId;
    clearNotFound();
    
    const allPlaces = await fetchPlaces();
    const places = allPlaces.slice(start, end === Infinity ? undefined : end);
    
    console.log(`Importing ${places.length} places (${start}-${Math.min(end, allPlaces.length)} of ${allPlaces.length})...\n`);
    
    const results = await importPlaces(places, listId);
    
    if (showReport) {
      reportNotFound();
      const list = await getList(listId);
      console.log(`\n✓ List now has ${list.count} places`);
    }
    
    return results;
  };

  /** Get not found places report */
  const getNotFound = () => _notFound;

  /** Clear not found list */
  const clearNotFound = () => { _notFound = []; };

  /** Load not-found from server (after refresh) */
  const loadNotFound = async (url = 'http://localhost:3456/not-found') => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load: ${resp.status}`);
    _notFound = await resp.json();
    console.log(`Loaded ${_notFound.length} not-found places`);
    return _notFound;
  };

  /** Download data as JSON file */
  const downloadJson = (data, filename = 'data.json') => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    console.log(`✓ Downloaded ${filename}`);
  };

  /** Download starred places as JSON */
  const downloadStarred = async () => {
    const places = await getStarredPlaces();
    downloadJson(places, 'starred-places.json');
    return places;
  };

  /** Download raw starred places response (for debugging) */
  const downloadStarredRaw = async () => {
    const pb = '!4m12!1m3!1d34205015.708281964!2d-3.8088220729247317!3d40.31063439697399!2m3!1f0!2f0!3f0!3m2!1i1215!2i1054!4f13.1!7i20!10b1!12m25!1m5!18b1!30b1!31m1!1b1!34e1!2m4!5m1!6e2!20e3!39b1!10b1!12b1!13b1!16b1!17m1!3e1!20m3!5e2!6b1!14b1!46m1!1b0!96b1!99b1!19m4!2m3!1i360!2i120!4i8!20m65!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0!15m16!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!22m2!1sWYE-aZnSPKyYkdUPpoCduAE!7e81!24m109!1m30!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1!18m19!3b1!4b1!5b1!6b1!9b1!13b1!14b1!17b1!20b1!21b1!22b1!27m1!1b0!28b0!32b1!33m1!1b1!34b1!36e2!10m1!8e3!11m1!3e1!14m1!3b0!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts!6m1!1e1!9b1!89b1!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!26m4!2m3!1i80!2i92!4i8!30m28!1m6!1m2!1i0!2i0!2m2!1i530!2i1054!1m6!1m2!1i1165!2i0!2m2!1i1215!2i1054!1m6!1m2!1i0!2i0!2m2!1i1215!2i20!1m6!1m2!1i0!2i1034!2m2!1i1215!2i1054!34m19!2b1!3b1!4b1!6b1!8m6!1b1!3b1!4b1!5b1!6b1!7b1!9b1!12b1!14b1!20b1!23b1!25b1!26b1!31b1!37m1!1e81!42b1!47m0!49m10!3b1!6m2!1b1!2b1!7m2!1e3!2b1!8b1!9b1!10e2!50m4!2e2!3m2!1b1!3b1!54m1!1e4!61b1!67m5!7b1!10b1!14b1!15m1!1b0!69i761';

    const url = new URL('https://www.google.com/search');
    url.searchParams.set('tbm', 'map');
    url.searchParams.set('authuser', CONFIG.authUser);
    url.searchParams.set('hl', CONFIG.lang);
    url.searchParams.set('gl', CONFIG.region);
    url.searchParams.set('pb', pb);
    url.searchParams.set('q', '*');
    url.searchParams.set('tch', '1');
    url.searchParams.set('ech', '4');

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
    
    const text = await resp.text();
    
    // Download raw response
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'starred-raw.txt';
    a.click();
    
    console.log(`✓ Downloaded starred-raw.txt (${text.length} bytes)`);
    return text;
  };

  /** Print not found report */
  const reportNotFound = () => {
    const byReason = { no_results: [], distance: [] };
    for (const p of _notFound) {
      byReason[p.reason]?.push(p);
    }
    
    console.log(`\n========== Not Found Report ==========`);
    console.log(`Total: ${_notFound.length}`);
    console.log(`  No search results: ${byReason.no_results.length}`);
    console.log(`  Too far (>${CONFIG.maxDistance}km): ${byReason.distance.length}`);
    
    if (byReason.distance.length > 0) {
      console.log(`\n--- Too Far (closest match) ---`);
      for (const p of byReason.distance.slice(0, 20)) {
        console.log(`  ${p.name} → ${p.closest?.name} (${p.closest?.distance})`);
      }
      if (byReason.distance.length > 20) {
        console.log(`  ... and ${byReason.distance.length - 20} more`);
      }
    }
    
    if (byReason.no_results.length > 0) {
      console.log(`\n--- No Results ---`);
      for (const p of byReason.no_results.slice(0, 20)) {
        console.log(`  ${p.name}`);
      }
      if (byReason.no_results.length > 20) {
        console.log(`  ... and ${byReason.no_results.length - 20} more`);
      }
    }
    
    return { total: _notFound.length, byReason };
  };

  // ========== EXPORT ==========
  return { 
    CONFIG, 
    refreshTokens, 
    search, 
    getList,
    getListByName,
    getLists,
    getStarredPlaces,
    getPlaceInfo,
    getListWithDetails,
    addPlace,
    updateNote,
    findPlace,
    importOne,
    importPlaces,
    importCategory,
    directImport,
    runImport,
    retryNotFound,
    fixEncodedNotes,
    stats,
    fetchPlaces,
    fetchHarakiri,
    fetchRonnyTokyo,
    getNotFound,
    clearNotFound,
    loadNotFound,
    reportNotFound,
    downloadJson,
    downloadStarred,
    downloadStarredRaw,
    utils: { sleep, distance, hexToPlaceIds, getToken }
  };
})();

console.log('✓ MapsAPI ready | getStarredPlaces() | getLists() | importPlaces()');
