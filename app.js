const TYPE_COLORS = {
  normal:["#A8A77A","#111"], fire:["#EE8130","#fff"], water:["#6390F0","#fff"], electric:["#F7D02C","#111"],
  grass:["#7AC74C","#fff"], ice:["#96D9D6","#111"], fighting:["#C22E28","#fff"], poison:["#A33EA1","#fff"],
  ground:["#E2BF65","#111"], flying:["#A98FF3","#fff"], psychic:["#F95587","#fff"], bug:["#A6B91A","#fff"],
  rock:["#B6A136","#fff"], ghost:["#735797","#fff"], dragon:["#6F35FC","#fff"], dark:["#705746","#fff"],
  steel:["#B7B7CE","#111"], fairy:["#D685AD","#fff"]
};

const STORAGE_KEY = "pokedexBuilderStateV3";
const GEN_CACHE_KEY = "pokedexBuilderGenerationCacheV1";
const GEN_RANGES = {
  1:[1,151], 2:[152,251], 3:[252,386], 4:[387,493], 5:[494,649],
  6:[650,721], 7:[722,809], 8:[810,905], 9:[906,1025]
};

let myDex = [];
let favorites = new Set();
let shinySet = new Set();
let caughtSet = new Set();
let generationCache = {};

const title = s => String(s || "").split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const ICONS = {
  pokeballActive: "assets/icons/pokeball.png",
  pokeballInactive: "assets/icons/pokeball_inactive.png",
  shiny: "assets/icons/shiny.png",
  favorite: "assets/icons/favorite.png"
};

function iconImg(src, alt) {
  return `<img class="icon-image" src="${src}" alt="${alt}">`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    myDexIds: myDex.map(p => p.id),
    customMons: myDex.filter(p => !DB.pokemon.some(x => x.id === p.id)),
    favorites: [...favorites],
    shiny: [...shinySet],
    caught: [...caughtSet]
  }));
  localStorage.setItem(GEN_CACHE_KEY, JSON.stringify(generationCache));
}

function loadState() {
  try {
    generationCache = JSON.parse(localStorage.getItem(GEN_CACHE_KEY) || "{}");
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const allCachedMons = Object.values(generationCache).flat();
    const source = [...DB.pokemon, ...allCachedMons, ...(state.customMons || [])];
    myDex = (state.myDexIds || []).map(id => source.find(p => p.id === id)).filter(Boolean);
    favorites = new Set(state.favorites || []);
    shinySet = new Set(state.shiny || []);
    caughtSet = new Set(state.caught || []);
  } catch {
    generationCache = {};
    myDex = [];
    favorites = new Set();
    shinySet = new Set();
    caughtSet = new Set();
  }
}

function init() {
  typeFilter.innerHTML += Object.keys(TYPE_COLORS).map(t => `<option value="${t}">${title(t)}</option>`).join("");
  addGenerationBtn.onclick = () => addGeneration(Number(generationSelect.value));
  clearBtn.onclick = clearAll;
  searchInput.oninput = renderCards;
  typeFilter.onchange = renderCards;
  statusFilter.onchange = renderCards;
  loadState();
  renderCards();
}

function setStatus(text) {
  loadingStatus.textContent = text || "";
}

function getLocalGeneration(gen) {
  if (gen === 1) return DB.pokemon;
  if (generationCache[gen]) return generationCache[gen];
  return null;
}

async function addGeneration(gen) {
  addGenerationBtn.disabled = true;
  generationSelect.disabled = true;

  try {
    setStatus(`Loading Generation ${gen}...`);
    let mons = getLocalGeneration(gen);

    if (!mons) {
      mons = await fetchGenerationFromPokeAPI(gen);
      generationCache[gen] = mons;
    }

    const existing = new Set(myDex.map(p => p.id));
    mons.forEach(p => {
      if (!existing.has(p.id)) myDex.push(p);
    });

    myDex.sort((a,b) => a.id - b.id);
    saveState();
    renderCards();
    setStatus(`Generation ${gen} added.`);
    setTimeout(() => setStatus(""), 1800);
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load Gen ${gen}. Check internet connection.`);
  } finally {
    addGenerationBtn.disabled = false;
    generationSelect.disabled = false;
  }
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

  const name = pokemon.name === "nidoran-f" ? "Nidoran♀" :
               pokemon.name === "nidoran-m" ? "Nidoran♂" :
               pokemon.name === "mr-mime" ? "Mr. Mime" :
               title(pokemon.name);

  return {
    id,
    dexNumber: `#${String(id).padStart(3,"0")}`,
    name,
    slug: pokemon.name,
    types: pokemon.types.map(t => t.type.name),
    species: species.genera.find(g => g.language.name === "en")?.genus || "Unknown Pokémon",
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
      national: `#${String(id).padStart(3,"0")}`,
      gen: `Generation ${getGenerationNumber(id)}`
    },
    spriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`,
    shinySpriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/${id}.png`
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

function getGenerationNumber(id) {
  for (const [gen, [start, end]] of Object.entries(GEN_RANGES)) {
    if (id >= start && id <= end) return Number(gen);
  }
  return "-";
}

function clearAll() {
  myDex = [];
  favorites.clear();
  shinySet.clear();
  caughtSet.clear();
  saveState();
  renderCards();
  detail.className = "detail";
}

function badge(t) {
  const c = TYPE_COLORS[t] || TYPE_COLORS.normal;
  return `<span class="badge" style="--badge:${c[0]};--badgeText:${c[1]}">${String(t).toUpperCase()}</span>`;
}

function getImageUrl(p) {
  if (shinySet.has(p.id)) {
    return p.shinySpriteUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/${p.id}.png`;
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
  if (detail.classList.contains("show")) openDetail(id);
}

function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveState();
  renderCards();
  if (detail.classList.contains("show")) openDetail(id);
}

function toggleShiny(id) {
  shinySet.has(id) ? shinySet.delete(id) : shinySet.add(id);
  saveState();
  renderCards();
  if (detail.classList.contains("show")) openDetail(id);
}

function renderCards() {
  const q = searchInput.value.toLowerCase();
  const t = typeFilter.value;
  const statusValue = statusFilter.value;

  const filtered = myDex.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(q) || String(p.id).includes(q);
    const matchType = t === "all" || p.types.includes(t);
    const matchStatus =
      statusValue === "all" ||
      (statusValue === "caught" && caughtSet.has(p.id)) ||
      (statusValue === "favorite" && favorites.has(p.id)) ||
      (statusValue === "shiny" && shinySet.has(p.id));

    return matchSearch && matchType && matchStatus;
  });

  const caughtCount = myDex.filter(p => caughtSet.has(p.id)).length;
  const count = `<div class="count" style="grid-column:1/-1">Pokédex: ${myDex.length} Pokémon • Displayed: ${filtered.length} • Caught: ${caughtCount}</div>`;

  const html = filtered.map(p => {
    const c = TYPE_COLORS[p.types[0]] || TYPE_COLORS.normal;
    const caughtClass = caughtSet.has(p.id) ? "caught-card" : "";
    return `<article class="card ${caughtClass}" style="--type:${c[0]};--typeText:${c[1]}" onclick="openDetail(${p.id})">
      <div class="top">
        <span class="dex">${p.dexNumber}</span>
        ${actionButtons(p)}
      </div>
      ${imageBox(p)}
      <div class="name">${p.name}</div>
      <div class="badges">${p.types.map(badge).join("")}</div>
    </article>`;
  }).join("");

  cards.innerHTML = count + (html || "<p>No Pokémon found for this filter.</p>");
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

function openDetail(id) {
  const p = myDex.find(x => x.id === id) || DB.pokemon.find(x => x.id === id);
  const d = damage(p.types);
  detail.className = "detail show";

  detail.innerHTML = `<button class="close" onclick="detail.className='detail'">×</button>
    <div class="top" style="align-items:flex-start">
      <div>
        <h1>${p.dexNumber} ${p.name}</h1>
        <div class="badges">${p.types.map(badge).join("")}</div>
      </div>
      ${actionButtons(p)}
    </div>

    ${imageBox(p)}

    <section class="detail-card">
      <h3>Status</h3>
      <p><b>Caught:</b> ${caughtSet.has(p.id) ? "Yes" : "No"}</p>
      <p><b>Favorite:</b> ${favorites.has(p.id) ? "Yes" : "No"}</p>
      <p><b>Shiny View:</b> ${shinySet.has(p.id) ? "On" : "Off"}</p>
    </section>

    <section class="detail-card">
      <h3>Base Stats</h3>
      ${Object.entries(p.baseStats).map(([k,v]) => `
        <div class="stat">
          <b>${k}</b>
          <span>${v ?? "-"}</span>
          <div class="bar"><div class="fill" style="width:${v ? Math.min(100, v/160*100) : 0}%"></div></div>
        </div>`).join("")}
    </section>

    <section class="detail-card">
      <h3>Info</h3>
      <p><b>Species:</b> ${p.species}</p>
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
      <h3>Catch Location</h3>
      ${(p.locations || []).map(x => `<span class="pill">${x}</span>`).join("") || "<p>-</p>"}
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
}

init();
