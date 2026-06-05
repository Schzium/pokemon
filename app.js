
const TYPE_COLORS = {
  normal:["#A8A77A","#111"], fire:["#EE8130","#fff"], water:["#6390F0","#fff"], electric:["#F7D02C","#111"],
  grass:["#7AC74C","#fff"], ice:["#96D9D6","#111"], fighting:["#C22E28","#fff"], poison:["#A33EA1","#fff"],
  ground:["#E2BF65","#111"], flying:["#A98FF3","#fff"], psychic:["#F95587","#fff"], bug:["#A6B91A","#fff"],
  rock:["#B6A136","#fff"], ghost:["#735797","#fff"], dragon:["#6F35FC","#fff"], dark:["#705746","#fff"],
  steel:["#B7B7CE","#111"], fairy:["#D685AD","#fff"]
};

const STORAGE_KEY = "pokedexBuilderStateV6";
const CACHE_KEY = "pokedexBuilderCacheV6";
const GEN_RANGES = {
  1:[1,151], 2:[152,251], 3:[252,386], 4:[387,493], 5:[494,649],
  6:[650,721], 7:[722,809], 8:[810,905], 9:[906,1025]
};

const VARIANT_NAME_REGEX = /-(mega(?:-[xy])?|gmax|alola|galar|hisui|paldea|primal|origin|therian)$/;
const ICONS = {
  pokeballActive: "assets/icons/pokeball.png",
  pokeballInactive: "assets/icons/pokeball_inactive.png",
  shiny: "assets/icons/shiny.png",
  favorite: "assets/icons/favorite.png"
};

let myDex = [];
let favorites = new Set();
let shinySet = new Set();
let caughtSet = new Set();
let cacheState = { base:{}, variants:[] };
let detailStatMode = "base";
let evolutionCache = {};
let itemCache = {};
let currentDetailId = null;

const title = s => String(s || "").split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const padDex = n => `#${String(n).padStart(3,"0")}`;

function iconImg(src, alt) {
  return `<img class="icon-image" src="${src}" alt="${alt}">`;
}

function specialDisplayName(name) {
  if (name === "nidoran-f") return "Nidoran♀";
  if (name === "nidoran-m") return "Nidoran♂";
  if (name === "mr-mime") return "Mr. Mime";
  return title(name);
}

function parseIdFromUrl(url) {
  const match = String(url).match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function variantInfo(slug, baseName) {
  if (slug.endsWith("-mega-x")) return { label:"Mega X", chip:"MEGA", name:`Mega ${baseName} X`, sort:0.20 };
  if (slug.endsWith("-mega-y")) return { label:"Mega Y", chip:"MEGA", name:`Mega ${baseName} Y`, sort:0.21 };
  if (slug.endsWith("-mega")) return { label:"Mega", chip:"MEGA", name:`Mega ${baseName}`, sort:0.19 };
  if (slug.endsWith("-gmax")) return { label:"Gigantamax", chip:"GMAX", name:`Gigantamax ${baseName}`, sort:0.30 };
  if (slug.endsWith("-alola")) return { label:"Alolan", chip:"REGIONAL", name:`Alolan ${baseName}`, sort:0.11 };
  if (slug.endsWith("-galar")) return { label:"Galarian", chip:"REGIONAL", name:`Galarian ${baseName}`, sort:0.12 };
  if (slug.endsWith("-hisui")) return { label:"Hisuian", chip:"REGIONAL", name:`Hisuian ${baseName}`, sort:0.13 };
  if (slug.endsWith("-paldea")) return { label:"Paldean", chip:"REGIONAL", name:`Paldean ${baseName}`, sort:0.14 };
  if (slug.endsWith("-primal")) return { label:"Primal", chip:"PRIMAL", name:`Primal ${baseName}`, sort:0.22 };
  if (slug.endsWith("-origin")) return { label:"Origin Forme", chip:"FORME", name:`${baseName} Origin Forme`, sort:0.23 };
  if (slug.endsWith("-therian")) return { label:"Therian Forme", chip:"FORME", name:`${baseName} Therian Forme`, sort:0.24 };
  return { label:"Variant", chip:"VARIANT", name:baseName, sort:0.99 };
}

function storageSnapshot() {
  return {
    favorites: [...favorites],
    shiny: [...shinySet],
    caught: [...caughtSet]
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storageSnapshot()));
  localStorage.setItem(CACHE_KEY, JSON.stringify(cacheState));
}

function loadState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    favorites = new Set(state.favorites || []);
    shinySet = new Set(state.shiny || []);
    caughtSet = new Set(state.caught || []);
    cacheState = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"base":{},"variants":[]}');
    if (!cacheState.base) cacheState.base = {};
    if (!Array.isArray(cacheState.variants)) cacheState.variants = [];
  } catch {
    favorites = new Set();
    shinySet = new Set();
    caughtSet = new Set();
    cacheState = { base:{}, variants:[] };
  }
}

function init() {
  typeFilter.innerHTML += Object.keys(TYPE_COLORS).map(t => `<option value="${t}">${title(t)}</option>`).join("");
  searchInput.oninput = renderCards;
  typeFilter.onchange = renderCards;
  statusFilter.onchange = renderCards;
  loadState();
  loadEverything();
}

function setStatus(text) {
  loadingStatus.textContent = text || "";
}

function getGenerationNumber(id) {
  for (const [gen, [start, end]] of Object.entries(GEN_RANGES)) {
    if (id >= start && id <= end) return Number(gen);
  }
  return "-";
}

function normalizeLocalPokemon(p) {
  return {
    id: p.id,
    dexNumber: p.dexNumber || padDex(p.id),
    baseDexNumber: p.id,
    name: p.name,
    slug: p.slug || p.name.toLowerCase().replace(/\s+/g,"-"),
    types: p.types || [],
    species: p.species || "Unknown Pokémon",
    description: p.description || "",
    height: p.height ?? "-",
    weight: p.weight ?? "-",
    eggGroups: p.eggGroups || [],
    catchRate: p.catchRate ?? "-",
    abilities: p.abilities || [],
    baseStats: p.baseStats || {},
    moves: p.moves || { physical:[], special:[], status:[] },
    locations: p.locations || [],
    availability: p.availability || [`Generation ${getGenerationNumber(p.id)}`],
    dexNumbers: p.dexNumbers || { national: padDex(p.id) },
    spriteUrl: p.spriteUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${p.id}.png`,
    shinySpriteUrl: p.shinySpriteUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/${p.id}.png`,
    isVariant: false,
    variantLabel: "",
    variantChip: "",
    sortGroup: 0,
    sortValue: p.id
  };
}

async function loadEverything() {
  setStatus("Loading Gen 1 from local database...");
  const localBase = DB.pokemon.map(normalizeLocalPokemon);

  const cachedBase = Object.values(cacheState.base || {});
  const cachedVariants = cacheState.variants || [];

  myDex = mergeAndSort(localBase, cachedBase, cachedVariants);
  renderCards();

  for (let gen = 2; gen <= 9; gen++) {
    if (!cacheState.base[gen]) {
      try {
        setStatus(`Loading Generation ${gen}...`);
        cacheState.base[gen] = await fetchGenerationFromPokeAPI(gen);
        myDex = mergeAndSort(localBase, Object.values(cacheState.base), cacheState.variants);
        saveState();
        renderCards();
      } catch (err) {
        console.error(err);
        setStatus(`Failed loading Gen ${gen}. Internet is needed to complete Pokédex.`);
        renderCards();
        return;
      }
    }
  }

  if (!cacheState.variants || cacheState.variants.length === 0) {
    try {
      setStatus("Loading variants as separate cards...");
      cacheState.variants = await fetchMajorVariants();
      myDex = mergeAndSort(localBase, Object.values(cacheState.base), cacheState.variants);
      saveState();
      renderCards();
    } catch (err) {
      console.error(err);
      setStatus("Base Pokédex loaded. Variant loading failed, please check internet.");
      renderCards();
      return;
    }
  } else {
    myDex = mergeAndSort(localBase, Object.values(cacheState.base), cacheState.variants);
    renderCards();
  }

  const variantCount = cacheState.variants.length;
  setStatus(`Loaded ${myDex.length} cards, including ${variantCount} variant cards.`);
}

function mergeAndSort(localBase, cachedBaseArrays, variants) {
  const allBase = [...localBase, ...cachedBaseArrays.flat()];
  const dedup = new Map();
  for (const p of allBase) dedup.set(String(p.id), p);
  for (const v of variants) dedup.set(String(v.id), v);

  return [...dedup.values()].sort((a,b) => {
    if ((a.baseDexNumber || a.id) !== (b.baseDexNumber || b.id)) {
      return (a.baseDexNumber || a.id) - (b.baseDexNumber || b.id);
    }
    if ((a.sortGroup || 0) !== (b.sortGroup || 0)) return (a.sortGroup || 0) - (b.sortGroup || 0);
    if ((a.sortValue || a.id) !== (b.sortValue || b.id)) return (a.sortValue || a.id) - (b.sortValue || b.id);
    return a.name.localeCompare(b.name);
  });
}

async function fetchGenerationFromPokeAPI(gen) {
  const [start, end] = GEN_RANGES[gen];
  const ids = [];
  for (let id = start; id <= end; id++) ids.push(id);

  const result = [];
  const chunkSize = 12;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    setStatus(`Loading Gen ${gen}: ${Math.min(i + chunk.length, ids.length)} / ${ids.length}`);
    const mons = await Promise.all(chunk.map(fetchPokemonById));
    result.push(...mons.filter(Boolean));
  }

  return result.sort((a,b) => a.id - b.id);
}

async function fetchPokemonById(id) {
  const pokemon = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then(r => r.json());
  const species = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`).then(r => r.json());
  const encounters = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}/encounters`).then(r => r.json()).catch(() => []);

  const name = specialDisplayName(pokemon.name);
  const description = species.flavor_text_entries?.find(e => e.language.name === "en")?.flavor_text?.replace(/\f|\n/g, " ") || "";
  return {
    id,
    dexNumber: padDex(id),
    baseDexNumber: id,
    name,
    slug: pokemon.name,
    types: pokemon.types.map(t => t.type.name),
    species: species.genera.find(g => g.language.name === "en")?.genus || "Unknown Pokémon",
    description,
    height: Number(pokemon.height) / 10,
    weight: Number(pokemon.weight) / 10,
    eggGroups: species.egg_groups.map(e => e.name),
    catchRate: species.capture_rate,
    abilities: pokemon.abilities.map(a => `${title(a.ability.name)}${a.is_hidden ? " (Hidden)" : ""}`),
    baseStats: {
      hp: pokemon.stats.find(s => s.stat.name === "hp")?.base_stat,
      attack: pokemon.stats.find(s => s.stat.name === "attack")?.base_stat,
      defense: pokemon.stats.find(s => s.stat.name === "defense")?.base_stat,
      specialAttack: pokemon.stats.find(s => s.stat.name === "special-attack")?.base_stat,
      specialDefense: pokemon.stats.find(s => s.stat.name === "special-defense")?.base_stat,
      speed: pokemon.stats.find(s => s.stat.name === "speed")?.base_stat
    },
    moves: buildMovePreview(pokemon.moves),
    locations: encounters.map(e => title(e.location_area.name)).slice(0, 12),
    availability: [`Generation ${getGenerationNumber(id)}`],
    dexNumbers: {
      national: padDex(id),
      gen: `Generation ${getGenerationNumber(id)}`
    },
    spriteUrl: pokemon.sprites?.other?.home?.front_default || pokemon.sprites?.other?.["official-artwork"]?.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`,
    shinySpriteUrl: pokemon.sprites?.other?.home?.front_shiny || pokemon.sprites?.front_shiny || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/${id}.png`,
    isVariant: false,
    variantLabel: "",
    variantChip: "",
    sortGroup: 0,
    sortValue: id
  };
}

function buildMovePreview(moves) {
  const names = moves.map(m => title(m.move.name)).slice(0, 24);
  return {
    physical: names.slice(0, 8),
    special: names.slice(8, 16),
    status: names.slice(16, 24)
  };
}

async function fetchMajorVariants() {
  const allList = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=2000`).then(r => r.json());
  const candidateEntries = allList.results.filter(item => VARIANT_NAME_REGEX.test(item.name));

  const variants = [];
  const chunkSize = 8;
  for (let i = 0; i < candidateEntries.length; i += chunkSize) {
    const chunk = candidateEntries.slice(i, i + chunkSize);
    setStatus(`Loading variants: ${Math.min(i + chunk.length, candidateEntries.length)} / ${candidateEntries.length}`);
    const built = await Promise.all(chunk.map(entry => fetchVariantByEntry(entry)));
    variants.push(...built.filter(Boolean));
  }
  return variants;
}

async function fetchVariantByEntry(entry) {
  const pokemon = await fetch(entry.url).then(r => r.json());
  const species = await fetch(pokemon.species.url).then(r => r.json());

  const baseDex = parseIdFromUrl(pokemon.species.url) || pokemon.id;
  const baseName = specialDisplayName(species.name);
  const info = variantInfo(entry.name, baseName);

  const description = species.flavor_text_entries?.find(e => e.language.name === "en")?.flavor_text?.replace(/\f|\n/g, " ") || "";
  return {
    id: pokemon.id,
    dexNumber: padDex(baseDex),
    baseDexNumber: baseDex,
    name: info.name,
    slug: entry.name,
    types: pokemon.types.map(t => t.type.name),
    species: species.genera.find(g => g.language.name === "en")?.genus || "Variant Pokémon",
    description,
    height: Number(pokemon.height) / 10,
    weight: Number(pokemon.weight) / 10,
    eggGroups: species.egg_groups.map(e => e.name),
    catchRate: species.capture_rate,
    abilities: pokemon.abilities.map(a => `${title(a.ability.name)}${a.is_hidden ? " (Hidden)" : ""}`),
    baseStats: {
      hp: pokemon.stats.find(s => s.stat.name === "hp")?.base_stat,
      attack: pokemon.stats.find(s => s.stat.name === "attack")?.base_stat,
      defense: pokemon.stats.find(s => s.stat.name === "defense")?.base_stat,
      specialAttack: pokemon.stats.find(s => s.stat.name === "special-attack")?.base_stat,
      specialDefense: pokemon.stats.find(s => s.stat.name === "special-defense")?.base_stat,
      speed: pokemon.stats.find(s => s.stat.name === "speed")?.base_stat
    },
    moves: buildMovePreview(pokemon.moves),
    locations: [],
    availability: [`Variant of ${baseName}`],
    dexNumbers: {
      national: padDex(baseDex),
      variant: info.label
    },
    spriteUrl: pokemon.sprites?.other?.home?.front_default || pokemon.sprites?.other?.["official-artwork"]?.front_default || pokemon.sprites?.front_default || "",
    shinySpriteUrl: pokemon.sprites?.other?.home?.front_shiny || pokemon.sprites?.front_shiny || "",
    isVariant: true,
    variantLabel: info.label,
    variantChip: info.chip,
    sortGroup: 1,
    sortValue: baseDex + info.sort
  };
}

function badge(t) {
  const c = TYPE_COLORS[t] || TYPE_COLORS.normal;
  return `<span class="badge" style="--badge:${c[0]};--badgeText:${c[1]}">${String(t).toUpperCase()}</span>`;
}

function getImageUrl(p, forceShiny = null) {
  const useShiny = forceShiny === null ? shinySet.has(p.id) : forceShiny;
  if (useShiny) {
    return p.shinySpriteUrl || p.spriteUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/${p.id}.png`;
  }
  return p.spriteUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${p.id}.png`;
}

function imageBox(p) {
  const src = getImageUrl(p);
  return `<div class="image-box"><img src="${src}" alt="${p.name}" loading="lazy" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend','<span>No image</span>')"></div>`;
}

function actionButtons(p) {
  const favActive = favorites.has(p.id) ? "active" : "";
  const shinyActive = shinySet.has(p.id) ? "active" : "";
  const caughtActive = caughtSet.has(p.id) ? "active" : "";
  return `<div class="card-action-group">
    <button class="icon-btn caught ${caughtActive}" title="Mark as caught" onclick="event.stopPropagation();toggleCaught(${p.id})">${iconImg(caughtSet.has(p.id) ? ICONS.pokeballActive : ICONS.pokeballInactive, "Caught")}</button>
    <button class="icon-btn favorite ${favActive}" title="Favorite" onclick="event.stopPropagation();toggleFavorite(${p.id})">${iconImg(ICONS.favorite, "Favorite")}</button>
    <button class="icon-btn shiny ${shinyActive}" title="Switch shiny" onclick="event.stopPropagation();toggleShiny(${p.id})">${iconImg(ICONS.shiny, "Shiny")}</button>
  </div>`;
}

function toggleCaught(id) {
  caughtSet.has(id) ? caughtSet.delete(id) : caughtSet.add(id);
  saveState();
  renderCards();
}

function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveState();
  renderCards();
}

function toggleShiny(id) {
  shinySet.has(id) ? shinySet.delete(id) : shinySet.add(id);
  saveState();
  renderCards();
  if (detail.classList.contains("show") && currentDetailId === id) openDetail(id);
}

function renderCards() {
  const q = searchInput.value.toLowerCase();
  const t = typeFilter.value;
  const statusValue = statusFilter.value;

  const filtered = myDex.filter(p => {
    const searchPool = `${p.name} ${p.slug} ${p.variantLabel || ""} ${p.dexNumber}`.toLowerCase();
    const matchSearch = searchPool.includes(q);
    const matchType = t === "all" || p.types.includes(t);
    const matchStatus =
      statusValue === "all" ||
      (statusValue === "caught" && caughtSet.has(p.id)) ||
      (statusValue === "favorite" && favorites.has(p.id)) ||
      (statusValue === "shiny" && shinySet.has(p.id));

    return matchSearch && matchType && matchStatus;
  });

  const caughtCount = myDex.filter(p => caughtSet.has(p.id)).length;
  const variantCount = myDex.filter(p => p.isVariant).length;
  const count = `<div class="count" style="grid-column:1/-1">Pokédex: ${myDex.length} Cards • Variants: ${variantCount} • Displayed: ${filtered.length} • Caught: ${caughtCount}</div>`;

  const html = filtered.map(p => {
    const c = TYPE_COLORS[p.types[0]] || TYPE_COLORS.normal;
    const c2 = (TYPE_COLORS[p.types[1]] || ["#ffffff","#111"])[0];
    const caughtClass = caughtSet.has(p.id) ? "caught-card" : "";
    return `<article class="card ${caughtClass}" style="--type:${c[0]};--typeText:${c[1]};--type2:${c2}" onclick="openDetail(${p.id})">
      <div class="top">
        <span class="dex">${p.dexNumber}</span>
        ${actionButtons(p)}
      </div>
      ${imageBox(p)}
      ${p.isVariant ? `<div class="variant-chip">${p.variantChip}</div>` : ""}
      <div class="name">${p.name}</div>
      ${p.isVariant ? `<div class="variant-subtitle">${p.variantLabel}</div>` : ""}
      <div class="badges">${p.types.map(badge).join("")}</div>
    </article>`;
  }).join("");

  cards.innerHTML = count + (html || "<p>No Pokémon found for this filter.</p>");
}

function statLabel(key) {
  const labels = { hp:"HP", attack:"Atk", defense:"Def", specialAttack:"Sp.Atk", specialDefense:"Sp.Def", speed:"Spe" };
  return labels[key] || key;
}

function statColor(key) {
  const colors = {
    hp:"#ef4444",
    attack:"#facc15",
    defense:"#f59e0b",
    specialAttack:"#38bdf8",
    specialDefense:"#22c55e",
    speed:"#a78bfa"
  };
  return colors[key] || "#ef4444";
}

function statMinMax(base, key) {
  const b = Number(base);
  if (!b) return { min: "-", max: "-" };
  if (key === "hp") {
    return {
      min: Math.floor(((2 * b) * 100) / 100) + 110,
      max: Math.floor(((2 * b + 31 + 63) * 100) / 100) + 110
    };
  }
  const neutralMin = Math.floor(((2 * b) * 100) / 100) + 5;
  const neutralMax = Math.floor(((2 * b + 31 + 63) * 100) / 100) + 5;
  return { min: Math.floor(neutralMin * 0.9), max: Math.floor(neutralMax * 1.1) };
}

function statValueForMode(key, base) {
  if (detailStatMode === "base") return base ?? "-";
  const mm = statMinMax(base, key);
  return detailStatMode === "min" ? mm.min : mm.max;
}

function statPercentForMode(key, base) {
  const value = statValueForMode(key, base);
  if (value === "-") return 0;
  if (detailStatMode === "base") return Math.min(100, Number(value) / 160 * 100);
  return Math.min(100, Number(value) / 450 * 100);
}

function setStatMode(mode, id) {
  detailStatMode = mode;
  openDetail(id);
}

function renderStatsCard(p) {
  const tab = mode => `<button class="stat-tab ${detailStatMode === mode ? "active" : ""}" onclick="setStatMode('${mode}', ${p.id})">${mode.toUpperCase()}</button>`;
  return `<section class="detail-card stats-card">
    <div class="stats-card-head">
      <h3>Stats</h3>
      <div class="stat-tabs">${tab("base")}${tab("min")}${tab("max")}</div>
    </div>
    <div class="stats-list">
      ${Object.entries(p.baseStats).map(([k,v]) => {
        const value = statValueForMode(k, v);
        const pct = statPercentForMode(k, v);
        const color = statColor(k);
        return `<div class="stat stat-${k}">
          <b>${statLabel(k)}</b>
          <span>${value}</span>
          <div class="bar"><div class="fill" style="width:${pct}%; background:${color}"></div></div>
        </div>`;
      }).join("")}
    </div>
    <p class="stat-note">${detailStatMode === "base" ? "Base stat values." : detailStatMode === "min" ? "Minimum estimated value at level 100." : "Maximum estimated value at level 100."}</p>
  </section>`;
}

function damage(types) {
  const all = Object.keys(TYPE_COLORS);
  const m = Object.fromEntries(all.map(t => [t, 1]));
  types.forEach(t => {
    const e = DB.typeChart[t] || {weak:[], resist:[], immune:[]};
    e.weak.forEach(x => m[x] *= 2);
    e.resist.forEach(x => m[x] *= .5);
    e.immune.forEach(x => m[x] = 0);
  });
  return {
    weak: all.filter(t => m[t] > 1),
    resist: all.filter(t => m[t] > 0 && m[t] < 1),
    immune: all.filter(t => m[t] === 0)
  };
}

function renderDetailHero(p) {
  return `<section class="detail-card detail-hero-card">
    <div class="detail-hero-meta">
      <div class="detail-dex-chip">${p.dexNumber} • ${p.species.toUpperCase()}</div>
      <h2>${p.name}</h2>
      <div class="badges">${p.types.map(badge).join("")}</div>
    </div>
    <div class="detail-dual-images">
      <div class="detail-image-compare">
        <div class="detail-image-wrap">${imageBox({ ...p, spriteUrl:getImageUrl(p,false), shinySpriteUrl:getImageUrl(p,true) }).replace('class="image-box"','class="image-box dual-box"')}</div>
        <div class="detail-image-label">Regular</div>
      </div>
      <div class="detail-image-compare">
        <div class="detail-image-wrap">${imageBox({ ...p, spriteUrl:getImageUrl(p,true), shinySpriteUrl:getImageUrl(p,true) }).replace('class="image-box"','class="image-box dual-box"')}</div>
        <div class="detail-image-label">Shiny</div>
      </div>
    </div>
  </section>`;
}

function renderItemRequirement(name, item) {
  const icon = item?.sprites?.default || "";
  const label = item?.name ? title(item.name) : title(name);
  return `<button class="evo-item-btn" onclick="openItemDetail('${name}')" title="${label}">
    ${icon ? `<img src="${icon}" alt="${label}">` : `<span class="evo-item-fallback">?</span>`}
    <span>${label}</span>
  </button>`;
}

function evolutionRequirementsHTML(details) {
  if (!details || details.length === 0) return `<div class="evo-requirements"><span class="evo-requirement-pill">No special requirement</span></div>`;
  const html = [];
  details.forEach(d => {
    if (d.trigger?.name) html.push(`<span class="evo-requirement-pill">Trigger: ${title(d.trigger.name)}</span>`);
    if (d.min_level !== null) html.push(`<span class="evo-requirement-pill">Level ${d.min_level}</span>`);
    if (d.min_happiness !== null) html.push(`<span class="evo-requirement-pill">Happiness ${d.min_happiness}+</span>`);
    if (d.min_affection !== null) html.push(`<span class="evo-requirement-pill">Affection ${d.min_affection}+</span>`);
    if (d.min_beauty !== null) html.push(`<span class="evo-requirement-pill">Beauty ${d.min_beauty}+</span>`);
    if (d.time_of_day) html.push(`<span class="evo-requirement-pill">${title(d.time_of_day)}</span>`);
    if (d.gender !== null) html.push(`<span class="evo-requirement-pill">${d.gender === 1 ? "Female" : d.gender === 2 ? "Male" : "Gender"}</span>`);
    if (d.needs_overworld_rain) html.push(`<span class="evo-requirement-pill">Overworld Rain</span>`);
    if (d.turn_upside_down) html.push(`<span class="evo-requirement-pill">Turn device upside-down</span>`);
    if (d.known_move?.name) html.push(`<span class="evo-requirement-pill">Know move: ${title(d.known_move.name)}</span>`);
    if (d.known_move_type?.name) html.push(`<span class="evo-requirement-pill">Know ${title(d.known_move_type.name)} move</span>`);
    if (d.held_item?.name) html.push(`<span class="evo-requirement-pill">Hold: ${title(d.held_item.name)}</span>`);
    if (d.location?.name) html.push(`<span class="evo-requirement-pill">Location: ${title(d.location.name)}</span>`);
    if (d.party_species?.name) html.push(`<span class="evo-requirement-pill">Party: ${title(d.party_species.name)}</span>`);
    if (d.party_type?.name) html.push(`<span class="evo-requirement-pill">Party type: ${title(d.party_type.name)}</span>`);
    if (d.trade_species?.name) html.push(`<span class="evo-requirement-pill">Trade for: ${title(d.trade_species.name)}</span>`);
    if (d.relative_physical_stats !== null) {
      const txt = d.relative_physical_stats === 1 ? "Atk > Def" : d.relative_physical_stats === -1 ? "Atk < Def" : "Atk = Def";
      html.push(`<span class="evo-requirement-pill">${txt}</span>`);
    }
    if (d.item?.name) html.push(renderItemRequirement(d.item.name, itemCache[d.item.name]));
  });
  return `<div class="evo-requirements">${html.join("")}</div>`;
}

function findDexEntryBySpeciesName(speciesName) {
  const lower = speciesName.toLowerCase();
  return myDex.find(p => !p.isVariant && p.slug === lower) || myDex.find(p => p.name.toLowerCase() === lower);
}

function relatedFormsHTML(speciesName) {
  const baseEntry = findDexEntryBySpeciesName(speciesName);
  if (!baseEntry) return "";
  const forms = myDex.filter(p => p.baseDexNumber === baseEntry.baseDexNumber && p.isVariant);
  if (!forms.length) return "";
  return `<div class="evo-form-list">${forms.map(f => `<button class="evo-form-chip" onclick="openDetail(${f.id})">${f.name}</button>`).join("")}</div>`;
}

function renderEvolutionNode(node, depth = 0) {
  const base = findDexEntryBySpeciesName(node.species.name);
  const id = base?.id;
  const img = base ? getImageUrl(base, false) : "";
  const dex = base ? base.dexNumber : "";
  const name = specialDisplayName(node.species.name);

  const childBlocks = (node.evolves_to || []).map(child => {
    const reqHtml = evolutionRequirementsHTML(child.evolution_details || []);
    return `<div class="evo-child-block">
      <div class="evo-connector">
        <div class="evo-line"></div>
        <div class="evo-arrow-down">↓</div>
      </div>
      ${reqHtml}
      ${renderEvolutionNode(child, depth + 1)}
    </div>`;
  }).join("");

  return `<div class="evo-node-v2" style="--depth:${depth}">
    <button class="evo-stage-card-v2" ${id ? `onclick="openDetail(${id})"` : ""}>
      <div class="evo-image-frame">
        ${img ? `<img src="${img}" alt="${name}">` : `<span>No Image</span>`}
      </div>
      <div class="evo-stage-info">
        <div class="evo-stage-dex-v2">${dex || "—"}</div>
        <div class="evo-stage-name-v2">${name}</div>
        ${relatedFormsHTML(node.species.name)}
      </div>
    </button>
    ${childBlocks ? `<div class="evo-children-v2">${childBlocks}</div>` : ""}
  </div>`;
}

async function ensureItemDetails(itemNames = []) {
  const missing = itemNames.filter(n => n && !itemCache[n]);
  if (!missing.length) return;
  await Promise.all(missing.map(async name => {
    try {
      const data = await fetch(`https://pokeapi.co/api/v2/item/${name}`).then(r => r.json());
      itemCache[name] = data;
    } catch {
      itemCache[name] = { name, effect_entries: [], sprites: {} };
    }
  }));
}

function collectItemNamesFromChain(node, bag = []) {
  (node.evolves_to || []).forEach(child => {
    (child.evolution_details || []).forEach(d => {
      if (d.item?.name) bag.push(d.item.name);
    });
    collectItemNamesFromChain(child, bag);
  });
  return bag;
}

async function fetchEvolutionData(p) {
  const baseDex = p.baseDexNumber || p.id;
  if (evolutionCache[baseDex]) return evolutionCache[baseDex];
  try {
    const species = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${baseDex}`).then(r => r.json());
    const chain = species.evolution_chain?.url
      ? await fetch(species.evolution_chain.url).then(r => r.json())
      : null;
    if (chain?.chain) {
      const itemNames = [...new Set(collectItemNamesFromChain(chain.chain))];
      await ensureItemDetails(itemNames);
    }
    evolutionCache[baseDex] = chain?.chain || null;
    return evolutionCache[baseDex];
  } catch (err) {
    console.error(err);
    evolutionCache[baseDex] = null;
    return null;
  }
}

function renderEvolutionPlaceholder() {
  return `<section class="detail-card"><h3>Evolutions</h3><p>Loading evolution data...</p></section>`;
}


function getEvoPokemonBySpeciesName(speciesName) {
  const lower = speciesName.toLowerCase();
  return myDex.find(p => !p.isVariant && p.slug === lower) || myDex.find(p => !p.isVariant && p.name.toLowerCase() === lower);
}

function getEvoRequirementText(details = []) {
  if (!details.length) return "";
  const d = details[0];

  const parts = [];
  if (d.min_level !== null) parts.push(`Lv. ${d.min_level}`);
  if (d.min_happiness !== null) parts.push(`Happiness ${d.min_happiness}+`);
  if (d.min_affection !== null) parts.push(`Affection ${d.min_affection}+`);
  if (d.min_beauty !== null) parts.push(`Beauty ${d.min_beauty}+`);
  if (d.time_of_day) parts.push(title(d.time_of_day));
  if (d.held_item?.name) parts.push(`Hold ${title(d.held_item.name)}`);
  if (d.item?.name) parts.push(title(d.item.name));
  if (d.known_move?.name) parts.push(`Know ${title(d.known_move.name)}`);
  if (d.known_move_type?.name) parts.push(`Know ${title(d.known_move_type.name)} move`);
  if (d.location?.name) parts.push(title(d.location.name));
  if (d.trade_species?.name) parts.push(`Trade ${title(d.trade_species.name)}`);
  if (d.trigger?.name === "trade" && !parts.some(p => p.includes("Trade"))) parts.push("Trade");
  if (d.gender === 1) parts.push("Female");
  if (d.gender === 2) parts.push("Male");

  if (!parts.length && d.trigger?.name) parts.push(title(d.trigger.name));
  return parts.join(" • ");
}

function evoStageHTML(speciesName) {
  const p = getEvoPokemonBySpeciesName(speciesName);
  const name = p ? p.name : specialDisplayName(speciesName);
  const img = p ? getImageUrl(p, false) : "";
  const id = p ? p.id : "";
  return `<button class="evo-ref-stage" ${id ? `onclick="openDetail(${id})"` : ""}>
    <div class="evo-ref-img">${img ? `<img src="${img}" alt="${name}">` : ""}</div>
    <div class="evo-ref-name">${name}</div>
  </button>`;
}

function evoConnectorHTML(label) {
  return `<div class="evo-ref-connector">
    <div class="evo-ref-arrow">→</div>
    ${label ? `<div class="evo-ref-label">${label}</div>` : ""}
  </div>`;
}

function chainToPaths(node, current = []) {
  const currentNode = [...current, { species: node.species.name, details: node.evolution_details || [] }];
  if (!node.evolves_to || node.evolves_to.length === 0) return [currentNode];
  return node.evolves_to.flatMap(child => chainToPaths(child, currentNode));
}

function renderEvolutionPath(path) {
  return `<div class="evo-ref-path">
    ${path.map((step, index) => {
      const connector = index === 0 ? "" : evoConnectorHTML(getEvoRequirementText(step.details));
      return `${connector}${evoStageHTML(step.species)}`;
    }).join("")}
  </div>`;
}

function megaStoneName(baseName) {
  const compact = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const special = {
    charizard: "Charizardite",
    mewtwo: "Mewtwonite",
    venusaur: "Venusaurite",
    blastoise: "Blastoisinite",
    alakazam: "Alakazite",
    gengar: "Gengarite",
    kangaskhan: "Kangaskhanite",
    pinsir: "Pinsirite",
    gyarados: "Gyaradosite",
    aerodactyl: "Aerodactylite",
    ampharos: "Ampharosite",
    scizor: "Scizorite",
    heracross: "Heracronite",
    houndoom: "Houndoominite",
    tyranitar: "Tyranitarite",
    sceptile: "Sceptilite",
    blaziken: "Blazikenite",
    swampert: "Swampertite",
    gardevoir: "Gardevoirite",
    sableye: "Sablenite",
    mawile: "Mawilite",
    aggron: "Aggronite",
    medicham: "Medichamite",
    manectric: "Manectite",
    sharpedo: "Sharpedonite",
    camerupt: "Cameruptite",
    altaria: "Altarianite",
    banette: "Banettite",
    absol: "Absolite",
    glalie: "Glalitite",
    salamence: "Salamencite",
    metagross: "Metagrossite",
    latias: "Latiasite",
    latios: "Latiosite",
    lopunny: "Lopunnite",
    garchomp: "Garchompite",
    lucario: "Lucarionite",
    abomasnow: "Abomasite",
    gallade: "Galladite",
    audino: "Audinite",
    diancie: "Diancite"
  };
  return special[compact] || `${baseName}ite`;
}

function renderVariantRowsFromChain(chain) {
  const speciesNames = chainToPaths(chain).flat().map(s => s.species);
  const uniqueBase = [...new Set(speciesNames)]
    .map(name => getEvoPokemonBySpeciesName(name))
    .filter(Boolean);

  const rows = [];

  uniqueBase.forEach(base => {
    const variants = myDex.filter(v => v.isVariant && v.baseDexNumber === base.baseDexNumber);
    variants.forEach(v => {
      let req = "Form";
      if (v.variantChip === "MEGA") req = `Hold ${megaStoneName(base.name)}`;
      if (v.variantChip === "GMAX") req = "Gigantamax";
      if (v.variantChip === "REGIONAL") req = v.variantLabel;
      if (v.variantChip === "PRIMAL") req = "Primal Reversion";

      rows.push(`<div class="evo-ref-form-row">
        <div class="evo-ref-form-title">${v.variantChip === "MEGA" ? "MEGA EVOLUTION" : v.variantChip}</div>
        <div class="evo-ref-path">
          ${evoStageHTML(base.slug)}
          ${evoConnectorHTML(req)}
          <button class="evo-ref-stage" onclick="openDetail(${v.id})">
            <div class="evo-ref-img">${getImageUrl(v, false) ? `<img src="${getImageUrl(v, false)}" alt="${v.name}">` : ""}</div>
            <div class="evo-ref-name">${v.name}</div>
          </button>
        </div>
      </div>`);
    });
  });

  return rows.join("");
}

function renderEvolutionSection(chain) {
  if (!chain) {
    return `<section class="detail-card evolution-card">
      <h3>Evolution Tree</h3>
      <p>No evolution data found.</p>
    </section>`;
  }

  const paths = chainToPaths(chain);
  const formRows = renderVariantRowsFromChain(chain);

  return `<section class="detail-card evolution-card evo-ref-card">
    <h3>Evolution Tree</h3>
    <div class="evo-ref-scroll">
      <div class="evo-ref-main">
        ${paths.map(renderEvolutionPath).join("")}
        ${formRows ? `<div class="evo-ref-divider"></div>${formRows}` : ""}
      </div>
    </div>
  </section>`;
}

async function openDetail(id) {
  currentDetailId = id;
  const p = myDex.find(x => x.id === id) || DB.pokemon.find(x => x.id === id);
  const d = damage(p.types);
  detail.className = "detail show";
  detail.innerHTML = `<button class="close" onclick="detail.className='detail'">×</button>
    <div class="detail-header-block">
      ${p.isVariant ? `<div class="detail-variant-label">${p.variantLabel}</div>` : ""}
      <h1>${p.dexNumber} ${p.name}</h1>
      <div class="badges">${p.types.map(badge).join("")}</div>
    </div>
    ${renderDetailHero(p)}
    ${renderSummaryCard(p)}
    ${renderDescriptionCard(p)}
    ${renderLocationsCard(p)}
    ${renderEvolutionPlaceholder()}
    ${renderStatsCard(p)}
    <section class="detail-card">
      <h3>Info</h3>
      <p><b>Egg Group:</b> ${p.eggGroups.join(", ") || "-"}</p>
      <p><b>Catch Rate:</b> ${p.catchRate ?? "-"} / 255</p>
      <p><b>Abilities:</b> ${p.abilities.join(", ") || "-"}</p>
      <p><b>Available:</b> ${p.availability.join(", ")}</p>
    </section>
    <section class="detail-card">
      <h3>Moves by Category</h3>
      ${Object.entries(p.moves).map(([cat,m]) => `
        <h4>${title(cat)}</h4>
        ${m.map(x => `<span class="pill">${x}</span>`).join("") || "<p>-</p>"}
      `).join("")}
    </section>
    <section class="detail-card">
      <h3>Weakness, Resistance, Immunity</h3>
      <h4>Weakness</h4>${d.weak.map(badge).join("") || "-"}
      <h4>Resistance</h4>${d.resist.map(badge).join("") || "-"}
      <h4>Immunity</h4>${d.immune.map(badge).join("") || "-"}
    </section>
    <section class="detail-card">
      <h3>Dex Number</h3>
      ${Object.entries(p.dexNumbers).map(([k,v]) => `<span class="pill">${k}: ${v}</span>`).join("")}
    </section>`;

  const chain = await fetchEvolutionData(p);
  if (currentDetailId === id && detail.classList.contains("show")) {
    const cards = detail.querySelectorAll(".detail-card");
    const placeholder = [...cards].find(sec => sec.querySelector("h3")?.textContent === "Evolutions");
    if (placeholder) placeholder.outerHTML = renderEvolutionSection(chain);
  }
}


/* =========================================================
   v1.2.7 stable detail + evolution override
   ========================================================= */

function renderEvolutionSection(chain) {
  if (!chain) {
    return `<section class="detail-card evolution-card evo-ref-card">
      <h3>Evolution Tree</h3>
      <p>No evolution data found.</p>
    </section>`;
  }

  const paths = chainToPaths(chain);
  const formRows = renderVariantRowsFromChain(chain);

  return `<section class="detail-card evolution-card evo-ref-card">
    <h3>Evolution Tree</h3>
    <div class="evo-ref-scroll">
      <div class="evo-ref-main">
        ${paths.map(renderEvolutionPath).join("")}
        ${formRows ? `<div class="evo-ref-divider"></div>${formRows}` : ""}
      </div>
    </div>
  </section>`;
}

async function openDetail(id) {
  currentDetailId = id;
  const p = myDex.find(x => x.id === id) || DB.pokemon.find(x => x.id === id);
  if (!p) return;

  const d = damage(p.types || []);
  detail.className = "detail show";
  detail.innerHTML = `<button class="close" onclick="detail.className='detail'">×</button>
    <div class="detail-header-block">
      ${p.isVariant ? `<div class="detail-variant-label">${p.variantLabel}</div>` : ""}
      <h1>${p.dexNumber} ${p.name}</h1>
      <div class="badges">${(p.types || []).map(badge).join("")}</div>
    </div>
    ${renderDetailHero(p)}
    ${renderSummaryCard(p)}
    ${renderDescriptionCard(p)}
    ${renderLocationsCard(p)}
    ${renderEvolutionPlaceholder()}
    ${renderStatsCard(p)}
    <section class="detail-card">
      <h3>Info</h3>
      <p><b>Egg Group:</b> ${(p.eggGroups || []).join(", ") || "-"}</p>
      <p><b>Catch Rate:</b> ${p.catchRate ?? "-"} / 255</p>
      <p><b>Abilities:</b> ${(p.abilities || []).join(", ") || "-"}</p>
      <p><b>Available:</b> ${(p.availability || []).join(", ") || "-"}</p>
    </section>
    <section class="detail-card">
      <h3>Moves by Category</h3>
      ${Object.entries(p.moves || {physical:[], special:[], status:[]}).map(([cat,m]) => `
        <h4>${title(cat)}</h4>
        ${(m || []).map(x => `<span class="pill">${x}</span>`).join("") || "<p>-</p>"}
      `).join("")}
    </section>
    <section class="detail-card">
      <h3>Weakness, Resistance, Immunity</h3>
      <h4>Weakness</h4>${d.weak.map(badge).join("") || "-"}
      <h4>Resistance</h4>${d.resist.map(badge).join("") || "-"}
      <h4>Immunity</h4>${d.immune.map(badge).join("") || "-"}
    </section>
    <section class="detail-card">
      <h3>Dex Number</h3>
      ${Object.entries(p.dexNumbers || {national:p.dexNumber}).map(([k,v]) => `<span class="pill">${k}: ${v}</span>`).join("")}
    </section>`;

  try {
    const chain = await fetchEvolutionData(p);
    if (currentDetailId === id && detail.classList.contains("show")) {
      const cards = detail.querySelectorAll(".detail-card");
      const placeholder = [...cards].find(sec => sec.querySelector("h3")?.textContent === "Evolutions");
      if (placeholder) placeholder.outerHTML = renderEvolutionSection(chain);
    }
  } catch (err) {
    console.error(err);
    const cards = detail.querySelectorAll(".detail-card");
    const placeholder = [...cards].find(sec => sec.querySelector("h3")?.textContent === "Evolutions");
    if (placeholder) placeholder.outerHTML = `<section class="detail-card evolution-card evo-ref-card"><h3>Evolution Tree</h3><p>Evolution data failed to load.</p></section>`;
  }
}


/* =========================================================
   v1.2.9 safe detail render override
   This prevents the detail drawer from becoming blank if one section errors.
   ========================================================= */

function safeText(value, fallback = "-") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function safeMetric(value, unit) {
  return value === undefined || value === null || value === "" || value === "-" ? "-" : `${value} ${unit}`;
}

function safeSummaryCard(p) {
  return `<section class="detail-card summary-card">
    <div class="summary-main">
      <div class="summary-name-line">
        <h3>${safeText(p.name)}</h3>
        <span class="summary-dex">${safeText(p.dexNumber)}</span>
      </div>
      <div class="badges summary-badges">${(p.types || []).map(badge).join("")}</div>
      <div class="summary-species">${safeText(p.species, "Unknown Pokémon")}</div>
    </div>
    <div class="summary-side">
      <div class="summary-metric">
        <span class="summary-metric-label">HEIGHT</span>
        <span class="summary-metric-value">${safeMetric(p.height, "m")}</span>
      </div>
      <div class="summary-metric">
        <span class="summary-metric-label">WEIGHT</span>
        <span class="summary-metric-value">${safeMetric(p.weight, "kg")}</span>
      </div>
    </div>
  </section>`;
}

function safeDescriptionCard(p) {
  const text = p.description || "No description available.";
  return `<section class="detail-card description-card">
    <h3>Description</h3>
    <p class="description-text">${text}</p>
  </section>`;
}

function safeLocationsCard(p) {
  const locations = Array.isArray(p.locations) ? p.locations : [];
  return `<section class="detail-card locations-card">
    <div class="locations-head">
      <div>
        <h3>Locations</h3>
        <div class="locations-subtitle">Generation ${getGenerationNumber(p.baseDexNumber || p.id)}</div>
      </div>
      <button class="locations-pill" type="button">All Locations</button>
    </div>
    <div class="locations-list">
      ${locations.length
        ? locations.slice(0, 8).map(loc => `<div class="location-row"><span>${loc}</span></div>`).join("")
        : `<div class="location-empty">No location data available.</div>`}
    </div>
  </section>`;
}

function safeDetailHero(p) {
  const normal = getImageUrl(p, false);
  const shiny = getImageUrl(p, true);
  return `<section class="detail-card detail-hero-card">
    <div class="detail-hero-meta">
      <div class="detail-dex-chip">${safeText(p.dexNumber)} • ${safeText(p.species, "POKÉMON").toUpperCase()}</div>
      <h2>${safeText(p.name)}</h2>
      <div class="badges">${(p.types || []).map(badge).join("")}</div>
    </div>
    <div class="detail-dual-images">
      <div class="detail-image-compare">
        <div class="image-box dual-box"><img src="${normal}" alt="${safeText(p.name)} Regular" loading="lazy"></div>
        <div class="detail-image-label">Regular</div>
      </div>
      <div class="detail-image-compare">
        <div class="image-box dual-box"><img src="${shiny}" alt="${safeText(p.name)} Shiny" loading="lazy"></div>
        <div class="detail-image-label">Shiny</div>
      </div>
    </div>
  </section>`;
}

function safeEvolutionSection() {
  return `<section class="detail-card evolution-card evo-ref-card">
    <h3>Evolution Tree</h3>
    <p class="evo-loading-text">Loading evolution data...</p>
  </section>`;
}

function safeEvolutionError() {
  return `<section class="detail-card evolution-card evo-ref-card">
    <h3>Evolution Tree</h3>
    <p class="evo-loading-text">Evolution data failed to load.</p>
  </section>`;
}

function safeStatsCard(p) {
  try {
    return renderStatsCard(p);
  } catch (err) {
    console.error(err);
    return `<section class="detail-card stats-card"><h3>Stats</h3><p>Stats failed to render.</p></section>`;
  }
}

function safeRenderEvolution(chain) {
  try {
    if (typeof renderEvolutionSection === "function") return renderEvolutionSection(chain);
  } catch (err) {
    console.error(err);
  }
  return safeEvolutionError();
}

async function openDetail(id) {
  currentDetailId = id;
  const p = myDex.find(x => x.id === id) || DB.pokemon.find(x => x.id === id);
  if (!p) return;

  detail.className = "detail show";

  try {
    const d = damage(p.types || []);
    detail.innerHTML = `<button class="close" onclick="detail.className='detail'">×</button>
      <div class="detail-header-block">
        ${p.isVariant ? `<div class="detail-variant-label">${safeText(p.variantLabel)}</div>` : ""}
        <h1>${safeText(p.dexNumber)} ${safeText(p.name)}</h1>
        <div class="badges">${(p.types || []).map(badge).join("")}</div>
      </div>
      ${safeDetailHero(p)}
      ${safeSummaryCard(p)}
      ${safeDescriptionCard(p)}
      ${safeLocationsCard(p)}
      ${safeEvolutionSection()}
      ${safeStatsCard(p)}
      <section class="detail-card">
        <h3>Info</h3>
        <p><b>Egg Group:</b> ${(p.eggGroups || []).join(", ") || "-"}</p>
        <p><b>Catch Rate:</b> ${p.catchRate ?? "-"} / 255</p>
        <p><b>Abilities:</b> ${(p.abilities || []).join(", ") || "-"}</p>
        <p><b>Available:</b> ${(p.availability || []).join(", ") || "-"}</p>
      </section>
      <section class="detail-card">
        <h3>Moves by Category</h3>
        ${Object.entries(p.moves || {physical:[], special:[], status:[]}).map(([cat,m]) => `
          <h4>${title(cat)}</h4>
          ${(m || []).map(x => `<span class="pill">${x}</span>`).join("") || "<p>-</p>"}
        `).join("")}
      </section>
      <section class="detail-card">
        <h3>Weakness, Resistance, Immunity</h3>
        <h4>Weakness</h4>${d.weak.map(badge).join("") || "-"}
        <h4>Resistance</h4>${d.resist.map(badge).join("") || "-"}
        <h4>Immunity</h4>${d.immune.map(badge).join("") || "-"}
      </section>
      <section class="detail-card">
        <h3>Dex Number</h3>
        ${Object.entries(p.dexNumbers || {national:p.dexNumber}).map(([k,v]) => `<span class="pill">${k}: ${v}</span>`).join("")}
      </section>`;
  } catch (err) {
    console.error("Detail render failed:", err);
    detail.innerHTML = `<button class="close" onclick="detail.className='detail'">×</button>
      <section class="detail-card">
        <h3>${safeText(p.name, "Pokémon")}</h3>
        <p>Detail failed to render. Check browser console for error.</p>
      </section>`;
    return;
  }

  try {
    const chain = await fetchEvolutionData(p);
    if (currentDetailId === id && detail.classList.contains("show")) {
      const cards = detail.querySelectorAll(".detail-card");
      const placeholder = [...cards].find(sec => sec.querySelector("h3")?.textContent === "Evolution Tree");
      if (placeholder) placeholder.outerHTML = safeRenderEvolution(chain);
    }
  } catch (err) {
    console.error("Evolution render failed:", err);
    const cards = detail.querySelectorAll(".detail-card");
    const placeholder = [...cards].find(sec => sec.querySelector("h3")?.textContent === "Evolution Tree");
    if (placeholder) placeholder.outerHTML = safeEvolutionError();
  }
}


/* =========================================================
   v1.3.0 locations dropdown + fixed evolution width
   ========================================================= */

function safeLocationsCard(p) {
  const genNumber = getGenerationNumber(p.baseDexNumber || p.id);
  const locations = Array.isArray(p.locations) ? p.locations : [];
  const genOptions = Array.from({length:9}, (_, i) => {
    const gen = i + 1;
    const selected = gen === genNumber ? "selected" : "";
    return `<option value="${gen}" ${selected}>Gen. ${gen}</option>`;
  }).join("");

  return `<section class="detail-card locations-card">
    <div class="locations-head">
      <div>
        <h3>Locations</h3>
        <select class="locations-gen-select" onchange="renderSelectedLocationGen(this, ${p.id})">
          ${genOptions}
        </select>
      </div>
      <button class="locations-pill" type="button">All Locations</button>
    </div>
    <div class="locations-list" id="locationList-${p.id}">
      ${renderLocationRows(locations, genNumber)}
    </div>
  </section>`;
}

function renderLocationRows(locations, gen) {
  if (!locations || !locations.length) {
    return `<div class="location-empty">No location data available for Gen. ${gen}.</div>`;
  }

  return locations.slice(0, 8).map(loc => `
    <div class="location-row">
      <span>${loc}</span>
    </div>
  `).join("");
}

function renderSelectedLocationGen(select, pokemonId) {
  const p = myDex.find(x => x.id === pokemonId) || DB.pokemon.find(x => x.id === pokemonId);
  const list = document.getElementById(`locationList-${pokemonId}`);
  if (!p || !list) return;

  const selectedGen = Number(select.value);
  const nativeGen = getGenerationNumber(p.baseDexNumber || p.id);
  const locations = selectedGen === nativeGen ? (p.locations || []) : [];

  list.innerHTML = renderLocationRows(locations, selectedGen);
}

function renderEvolutionSection(chain) {
  if (!chain) {
    return `<section class="detail-card evolution-card evo-ref-card">
      <h3>Evolution Tree</h3>
      <p>No evolution data found.</p>
    </section>`;
  }

  const paths = chainToPaths(chain);
  const formRows = renderVariantRowsFromChain(chain);

  return `<section class="detail-card evolution-card evo-ref-card">
    <h3>Evolution Tree</h3>
    <div class="evo-ref-scroll no-scroll">
      <div class="evo-ref-main">
        ${paths.map(renderEvolutionPath).join("")}
        ${formRows ? `<div class="evo-ref-divider"></div>${formRows}` : ""}
      </div>
    </div>
  </section>`;
}


/* =========================================================
   v1.3.1 evolution item visual + clickable item detail
   ========================================================= */

const ITEM_LOCATION_NOTES = {
  "venusaurite": {
    "Gen VI": "Pokémon X/Y: Received together with Bulbasaur from Professor Sycamore in Lumiose City when you choose Bulbasaur.",
    "Gen VII": "Pokémon Ultra Sun/Ultra Moon: Purchase from the Battle Tree shop for 64 BP.",
    "Gen VIII": "Not obtainable in standard gameplay.",
    "Gen IX": "Not obtainable in standard gameplay."
  }
};

function getEvoRequirementData(details = []) {
  if (!details || !details.length) return { text: "", itemName: null, itemMode: "" };
  const d = details[0];
  const textParts = [];
  let itemName = null;
  let itemMode = "";

  if (d.min_level !== null) textParts.push(`Lv. ${d.min_level}`);
  if (d.min_happiness !== null) textParts.push(`Happiness ${d.min_happiness}+`);
  if (d.min_affection !== null) textParts.push(`Affection ${d.min_affection}+`);
  if (d.min_beauty !== null) textParts.push(`Beauty ${d.min_beauty}+`);
  if (d.time_of_day) textParts.push(title(d.time_of_day));
  if (d.known_move?.name) textParts.push(`Know ${title(d.known_move.name)}`);
  if (d.known_move_type?.name) textParts.push(`Know ${title(d.known_move_type.name)} move`);
  if (d.location?.name) textParts.push(title(d.location.name));
  if (d.trade_species?.name) textParts.push(`Trade ${title(d.trade_species.name)}`);
  if (d.trigger?.name === "trade" && !textParts.some(p => p.includes("Trade"))) textParts.push("Trade");
  if (d.gender === 1) textParts.push("Female");
  if (d.gender === 2) textParts.push("Male");

  if (d.held_item?.name) {
    itemName = d.held_item.name;
    itemMode = "Hold";
  } else if (d.item?.name) {
    itemName = d.item.name;
    itemMode = d.trigger?.name === "use-item" ? "Use" : "Item";
  } else if (!textParts.length && d.trigger?.name) {
    textParts.push(title(d.trigger.name));
  }

  return {
    text: textParts.join(" • "),
    itemName,
    itemMode
  };
}

function renderEvolutionItemVisual(itemName, compact = false) {
  const item = itemCache[itemName] || {};
  const icon = item?.sprites?.default || "";
  const label = item?.name ? title(item.name) : title(itemName);
  return `<button class="evo-item-visual ${compact ? "compact" : ""}" onclick="openItemDetail('${itemName}')"
    title="${label}">
    <div class="evo-item-visual-icon">
      ${icon ? `<img src="${icon}" alt="${label}">` : `<span class="evo-item-visual-fallback">?</span>`}
    </div>
    <div class="evo-item-visual-name">${label}</div>
  </button>`;
}

function evoConnectorHTML(details) {
  const info = Array.isArray(details) ? getEvoRequirementData(details) : { text: details || "", itemName: null, itemMode: "" };
  return `<div class="evo-ref-connector ${info.itemName ? "has-item" : ""}">
    <div class="evo-ref-arrow">→</div>
    ${info.itemName
      ? `<div class="evo-ref-item-stack">
          <div class="evo-ref-label">${info.itemMode || "Item"}</div>
          ${renderEvolutionItemVisual(info.itemName, true)}
          ${info.text ? `<div class="evo-ref-subtext">${info.text}</div>` : ``}
        </div>`
      : `<div class="evo-ref-label">${info.text || ""}</div>`
    }
  </div>`;
}

function renderEvolutionPath(path) {
  return `<div class="evo-ref-path">
    ${path.map((step, index) => {
      const connector = index === 0 ? "" : evoConnectorHTML(step.details);
      return `${connector}${evoStageHTML(step.species)}`;
    }).join("")}
  </div>`;
}

function renderVariantRowsFromChain(chain) {
  const speciesNames = chainToPaths(chain).flat().map(s => s.species);
  const uniqueBase = [...new Set(speciesNames)]
    .map(name => getEvoPokemonBySpeciesName(name))
    .filter(Boolean);

  const rows = [];

  uniqueBase.forEach(base => {
    const variants = myDex.filter(v => v.isVariant && v.baseDexNumber === base.baseDexNumber);
    variants.forEach(v => {
      const pathConnector =
        v.variantChip === "MEGA"
          ? evoConnectorHTML([{ held_item: { name: megaStoneName(base.name).toLowerCase() } }])
          : v.variantChip === "GMAX"
          ? evoConnectorHTML("Gigantamax")
          : v.variantChip === "REGIONAL"
          ? evoConnectorHTML(v.variantLabel)
          : v.variantChip === "PRIMAL"
          ? evoConnectorHTML("Primal Reversion")
          : evoConnectorHTML("Form");

      rows.push(`<div class="evo-ref-form-row">
        <div class="evo-ref-form-title">${v.variantChip === "MEGA" ? "MEGA EVOLUTION" : v.variantChip}</div>
        <div class="evo-ref-path evo-ref-form-path">
          ${evoStageHTML(base.slug)}
          ${pathConnector}
          <button class="evo-ref-stage" onclick="openDetail(${v.id})">
            <div class="evo-ref-img">${getImageUrl(v, false) ? `<img src="${getImageUrl(v, false)}" alt="${v.name}">` : ""}</div>
            <div class="evo-ref-name">${v.name}</div>
          </button>
        </div>
      </div>`);
    });
  });

  return rows.join("");
}

async function ensureVariantFormItemDetails(chain) {
  if (!chain) return;
  const speciesNames = chainToPaths(chain).flat().map(s => s.species);
  const uniqueBase = [...new Set(speciesNames)]
    .map(name => getEvoPokemonBySpeciesName(name))
    .filter(Boolean);

  const itemNames = [];
  uniqueBase.forEach(base => {
    const variants = myDex.filter(v => v.isVariant && v.baseDexNumber === base.baseDexNumber);
    variants.forEach(v => {
      if (v.variantChip === "MEGA") itemNames.push(megaStoneName(base.name).toLowerCase());
    });
  });

  if (itemNames.length) {
    await ensureItemDetails(itemNames);
  }
}

function itemEffectText(item) {
  return item?.effect_entries?.find(e => e.language?.name === "en")?.short_effect
    || item?.effect_entries?.find(e => e.language?.name === "en")?.effect
    || "No effect description available.";
}

function itemLocationNotesHTML(itemName) {
  const notes = ITEM_LOCATION_NOTES[itemName];
  if (!notes) {
    return `<div class="item-detail-empty">Location database for this item is not filled yet.</div>`;
  }
  return Object.entries(notes).map(([gen, note]) => `
    <div class="item-gen-row">
      <div class="item-gen-name">${gen}</div>
      <div class="item-gen-note">${note}</div>
    </div>
  `).join("");
}

async function openItemDetail(itemName) {
  await ensureItemDetails([itemName]);
  const item = itemCache[itemName] || { name: itemName, effect_entries: [], sprites: {} };

  let modal = document.getElementById("itemDetailModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "itemDetailModal";
    modal.className = "item-detail-modal";
    document.body.appendChild(modal);
  }

  const label = title(item.name || itemName);
  const icon = item?.sprites?.default || "";
  modal.innerHTML = `<div class="item-detail-backdrop" onclick="closeItemDetail()"></div>
    <div class="item-detail-dialog">
      <button class="item-detail-close" onclick="closeItemDetail()">×</button>
      <div class="item-detail-header">
        <div class="item-detail-icon-wrap">
          ${icon ? `<img src="${icon}" alt="${label}">` : `<div class="item-detail-fallback">?</div>`}
        </div>
        <div class="item-detail-header-text">
          <div class="item-detail-kicker">Evolution Item</div>
          <h3>${label}</h3>
        </div>
      </div>

      <section class="item-detail-section">
        <h4>Description</h4>
        <p>${itemEffectText(item)}</p>
      </section>

      <section class="item-detail-section">
        <h4>Locations by Generation</h4>
        <div class="item-gen-list">
          ${itemLocationNotesHTML(itemName)}
        </div>
      </section>
    </div>`;
  modal.classList.add("show");
}

function closeItemDetail() {
  const modal = document.getElementById("itemDetailModal");
  if (modal) modal.classList.remove("show");
}

async function openDetail(id) {
  currentDetailId = id;
  const p = myDex.find(x => x.id === id) || DB.pokemon.find(x => x.id === id);
  if (!p) return;

  detail.className = "detail show";

  try {
    const d = damage(p.types || []);
    detail.innerHTML = `<button class="close" onclick="detail.className='detail'">×</button>
      <div class="detail-header-block">
        ${p.isVariant ? `<div class="detail-variant-label">${safeText(p.variantLabel)}</div>` : ""}
        <h1>${safeText(p.dexNumber)} ${safeText(p.name)}</h1>
        <div class="badges">${(p.types || []).map(badge).join("")}</div>
      </div>
      ${safeDetailHero(p)}
      ${safeSummaryCard(p)}
      ${safeDescriptionCard(p)}
      ${safeLocationsCard(p)}
      ${safeEvolutionSection()}
      ${safeStatsCard(p)}
      <section class="detail-card">
        <h3>Info</h3>
        <p><b>Egg Group:</b> ${(p.eggGroups || []).join(", ") || "-"}</p>
        <p><b>Catch Rate:</b> ${p.catchRate ?? "-"} / 255</p>
        <p><b>Abilities:</b> ${(p.abilities || []).join(", ") || "-"}</p>
        <p><b>Available:</b> ${(p.availability || []).join(", ") || "-"}</p>
      </section>
      <section class="detail-card">
        <h3>Moves by Category</h3>
        ${Object.entries(p.moves || {physical:[], special:[], status:[]}).map(([cat,m]) => `
          <h4>${title(cat)}</h4>
          ${(m || []).map(x => `<span class="pill">${x}</span>`).join("") || "<p>-</p>"}
        `).join("")}
      </section>
      <section class="detail-card">
        <h3>Weakness, Resistance, Immunity</h3>
        <h4>Weakness</h4>${d.weak.map(badge).join("") || "-"}
        <h4>Resistance</h4>${d.resist.map(badge).join("") || "-"}
        <h4>Immunity</h4>${d.immune.map(badge).join("") || "-"}
      </section>
      <section class="detail-card">
        <h3>Dex Number</h3>
        ${Object.entries(p.dexNumbers || {national:p.dexNumber}).map(([k,v]) => `<span class="pill">${k}: ${v}</span>`).join("")}
      </section>`;
  } catch (err) {
    console.error("Detail render failed:", err);
    detail.innerHTML = `<button class="close" onclick="detail.className='detail'">×</button>
      <section class="detail-card">
        <h3>${safeText(p.name, "Pokémon")}</h3>
        <p>Detail failed to render. Check browser console for error.</p>
      </section>`;
    return;
  }

  try {
    const chain = await fetchEvolutionData(p);
    await ensureVariantFormItemDetails(chain);
    if (currentDetailId === id && detail.classList.contains("show")) {
      const cards = detail.querySelectorAll(".detail-card");
      const placeholder = [...cards].find(sec => sec.querySelector("h3")?.textContent === "Evolution Tree");
      if (placeholder) placeholder.outerHTML = safeRenderEvolution(chain);
    }
  } catch (err) {
    console.error("Evolution render failed:", err);
    const cards = detail.querySelectorAll(".detail-card");
    const placeholder = [...cards].find(sec => sec.querySelector("h3")?.textContent === "Evolution Tree");
    if (placeholder) placeholder.outerHTML = safeEvolutionError();
  }
}


/* =========================================================
   v1.3.2 clean evolution item connector
   ========================================================= */

function getEvoRequirementData(details = []) {
  if (!details || !details.length) return { text: "", itemName: null, itemMode: "" };
  const d = details[0] || {};
  const textParts = [];
  let itemName = null;
  let itemMode = "";

  if (d.min_level !== null && d.min_level !== undefined) textParts.push(`Lv. ${d.min_level}`);
  if (d.min_happiness !== null && d.min_happiness !== undefined) textParts.push(`Happiness ${d.min_happiness}+`);
  if (d.min_affection !== null && d.min_affection !== undefined) textParts.push(`Affection ${d.min_affection}+`);
  if (d.min_beauty !== null && d.min_beauty !== undefined) textParts.push(`Beauty ${d.min_beauty}+`);
  if (d.time_of_day) textParts.push(title(d.time_of_day));
  if (d.known_move?.name) textParts.push(`Know ${title(d.known_move.name)}`);
  if (d.known_move_type?.name) textParts.push(`Know ${title(d.known_move_type.name)} move`);
  if (d.location?.name) textParts.push(title(d.location.name));
  if (d.trade_species?.name) textParts.push(`Trade ${title(d.trade_species.name)}`);
  if (d.trigger?.name === "trade" && !textParts.some(p => p.includes("Trade"))) textParts.push("Trade");
  if (d.gender === 1) textParts.push("Female");
  if (d.gender === 2) textParts.push("Male");

  if (d.held_item?.name) {
    itemName = d.held_item.name;
    itemMode = "Hold";
  } else if (d.item?.name) {
    itemName = d.item.name;
    itemMode = d.trigger?.name === "use-item" ? "Use" : "Item";
  } else if (!textParts.length && d.trigger?.name) {
    textParts.push(title(d.trigger.name));
  }

  return {
    text: textParts.join(" • "),
    itemName,
    itemMode
  };
}

function evoConnectorHTML(details) {
  const info = Array.isArray(details)
    ? getEvoRequirementData(details)
    : { text: details || "", itemName: null, itemMode: "" };

  return `<div class="evo-ref-connector ${info.itemName ? "has-item" : ""}">
    <div class="evo-ref-arrow">→</div>
    ${info.itemName
      ? `<div class="evo-ref-item-stack">
          <div class="evo-ref-label item-mode">${info.itemMode || "Item"}</div>
          ${renderEvolutionItemVisual(info.itemName, true)}
          ${info.text ? `<div class="evo-ref-subtext">${info.text}</div>` : ``}
        </div>`
      : `<div class="evo-ref-label">${info.text || ""}</div>`
    }
  </div>`;
}

function renderVariantRowsFromChain(chain) {
  const speciesNames = chainToPaths(chain).flat().map(s => s.species);
  const uniqueBase = [...new Set(speciesNames)]
    .map(name => getEvoPokemonBySpeciesName(name))
    .filter(Boolean);

  const rows = [];

  uniqueBase.forEach(base => {
    const variants = myDex.filter(v => v.isVariant && v.baseDexNumber === base.baseDexNumber);
    variants.forEach(v => {
      const pathConnector =
        v.variantChip === "MEGA"
          ? evoConnectorHTML([{ held_item: { name: megaStoneName(base.name).toLowerCase() } }])
          : v.variantChip === "GMAX"
          ? evoConnectorHTML("Gigantamax")
          : v.variantChip === "REGIONAL"
          ? evoConnectorHTML(v.variantLabel)
          : v.variantChip === "PRIMAL"
          ? evoConnectorHTML("Primal Reversion")
          : evoConnectorHTML("Form");

      rows.push(`<div class="evo-ref-form-row">
        <div class="evo-ref-form-title">${v.variantChip === "MEGA" ? "MEGA EVOLUTION" : v.variantChip}</div>
        <div class="evo-ref-path evo-ref-form-path">
          ${evoStageHTML(base.slug)}
          ${pathConnector}
          <button class="evo-ref-stage" onclick="openDetail(${v.id})">
            <div class="evo-ref-img">${getImageUrl(v, false) ? `<img src="${getImageUrl(v, false)}" alt="${v.name}">` : ""}</div>
            <div class="evo-ref-name">${v.name}</div>
          </button>
        </div>
      </div>`);
    });
  });

  return rows.join("");
}

init();
