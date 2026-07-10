/**
 * app.js — ChefAI Premium Frontend
 * ──────────────────────────────────
 * All backend API calls preserved exactly:
 *  - /api/recommend   (POST)
 *  - /api/substitutions (POST)
 *  - /api/shopping-list (POST)
 *  - /api/leftover    (POST)
 *  - /api/detect-missing (POST)
 *  - /api/favorites   (GET/POST/DELETE)
 *  - /api/history     (GET/DELETE)
 *  - /api/recipes     (GET)
 *  - /api/recipes/:id (GET)
 *  - /api/health      (GET)
 *
 * New in this version:
 *  - Image mapping by recipe name keyword
 *  - Unsplash food photos via URL patterns (no API key required)
 *  - Glassmorphism recipe cards with real food images
 *  - Parallax scroll effect on botanical background
 *  - Smooth fade-up on scroll (IntersectionObserver)
 *  - Nav active state management
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
const State = {
  ingredients:         [],
  leftoverIngredients: [],
  shoppingHave:        [],
  currentRecipeId:     null,
  currentRecipeName:   null,
  browseRecipes:       [],
  favoriteIds:         new Set(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add suggestions
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  'chicken', 'eggs', 'garlic', 'onion', 'tomato',
  'rice', 'pasta', 'paneer', 'tofu', 'potatoes',
  'lentils', 'chickpeas', 'spinach', 'bell pepper', 'ginger',
];

const CUISINE_EMOJI = { Indian:'🇮🇳', Chinese:'🇨🇳', Italian:'🇮🇹', Mexican:'🇲🇽' };
const CUISINE_CLASS = {
  indian:  'cuisine-indian',
  chinese: 'cuisine-chinese',
  italian: 'cuisine-italian',
  mexican: 'cuisine-mexican',
};
const DIET_CLASS = {
  'vegetarian':   'tag-vegetarian',
  'vegan':        'tag-vegan',
  'gluten-free':  'tag-gluten-free',
  'high protein': 'tag-high-protein',
};

// ─────────────────────────────────────────────────────────────────────────────
// Image Mapping — keyword → curated Unsplash food photo URL
// Maps recipe name keywords to high-quality food photos.
// Uses Unsplash Source API (no key required, public CDN).
// ─────────────────────────────────────────────────────────────────────────────
const IMAGE_MAP = {
  // Indian
  'biryani':          'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=250&fit=crop&auto=format',
  'tikka masala':     'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=250&fit=crop&auto=format',
  'tikka':            'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=250&fit=crop&auto=format',
  'paneer':           'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=250&fit=crop&auto=format',
  'dal':              'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=250&fit=crop&auto=format',
  'palak':            'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=250&fit=crop&auto=format',
  'chana':            'https://images.unsplash.com/photo-1607301406259-dfb186e15de8?w=400&h=250&fit=crop&auto=format',
  'masala':           'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=250&fit=crop&auto=format',
  'curry':            'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&h=250&fit=crop&auto=format',
  'samosa':           'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&h=250&fit=crop&auto=format',
  'naan':             'https://images.unsplash.com/photo-1606471191009-63994c53433b?w=400&h=250&fit=crop&auto=format',
  'roti':             'https://images.unsplash.com/photo-1606471191009-63994c53433b?w=400&h=250&fit=crop&auto=format',
  'idli':             'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400&h=250&fit=crop&auto=format',
  'dosa':             'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400&h=250&fit=crop&auto=format',
  // Chinese
  'kung pao':         'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=250&fit=crop&auto=format',
  'fried rice':       'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=250&fit=crop&auto=format',
  'noodle':           'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400&h=250&fit=crop&auto=format',
  'noodles':          'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400&h=250&fit=crop&auto=format',
  'dumpling':         'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=250&fit=crop&auto=format',
  'dim sum':          'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=250&fit=crop&auto=format',
  'wonton':           'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=250&fit=crop&auto=format',
  'mapo tofu':        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=250&fit=crop&auto=format',
  'spring roll':      'https://images.unsplash.com/photo-1548369937-47519962c11a?w=400&h=250&fit=crop&auto=format',
  'stir fry':         'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=250&fit=crop&auto=format',
  'peking':           'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=250&fit=crop&auto=format',
  'hot pot':          'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&h=250&fit=crop&auto=format',
  // Italian
  'pizza':            'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=250&fit=crop&auto=format',
  'pasta':            'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=250&fit=crop&auto=format',
  'spaghetti':        'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=250&fit=crop&auto=format',
  'carbonara':        'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400&h=250&fit=crop&auto=format',
  'risotto':          'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=250&fit=crop&auto=format',
  'tiramisu':         'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=250&fit=crop&auto=format',
  'pesto':            'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=250&fit=crop&auto=format',
  'lasagna':          'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400&h=250&fit=crop&auto=format',
  'bruschetta':       'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=400&h=250&fit=crop&auto=format',
  'fettuccine':       'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=250&fit=crop&auto=format',
  'aglio':            'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=250&fit=crop&auto=format',
  'gnocchi':          'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=250&fit=crop&auto=format',
  // Mexican
  'taco':             'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=250&fit=crop&auto=format',
  'tacos':            'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=250&fit=crop&auto=format',
  'burrito':          'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=400&h=250&fit=crop&auto=format',
  'enchilada':        'https://images.unsplash.com/photo-1534352956036-cd81e27dd615?w=400&h=250&fit=crop&auto=format',
  'guacamole':        'https://images.unsplash.com/photo-1571191773760-6e0a3e618f0e?w=400&h=250&fit=crop&auto=format',
  'quesadilla':       'https://images.unsplash.com/photo-1618040996337-56904b7850b9?w=400&h=250&fit=crop&auto=format',
  'nachos':           'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=400&h=250&fit=crop&auto=format',
  'salsa':            'https://images.unsplash.com/photo-1571191773760-6e0a3e618f0e?w=400&h=250&fit=crop&auto=format',
  'churro':           'https://images.unsplash.com/photo-1619221882266-c77b0985cc75?w=400&h=250&fit=crop&auto=format',
  // General foods
  'soup':             'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&h=250&fit=crop&auto=format',
  'salad':            'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=250&fit=crop&auto=format',
  'steak':            'https://images.unsplash.com/photo-1546833998-877b37c2e5c6?w=400&h=250&fit=crop&auto=format',
  'salmon':           'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=250&fit=crop&auto=format',
  'fish':             'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=250&fit=crop&auto=format',
  'burger':           'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=250&fit=crop&auto=format',
  'sandwich':         'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=250&fit=crop&auto=format',
  'cake':             'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=250&fit=crop&auto=format',
  'chocolate':        'https://images.unsplash.com/photo-1481391243133-f96216dcb5d2?w=400&h=250&fit=crop&auto=format',
  'omelette':         'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=250&fit=crop&auto=format',
  'egg':              'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=250&fit=crop&auto=format',
  'smoothie':         'https://images.unsplash.com/photo-1502741224143-90386d7f8c82?w=400&h=250&fit=crop&auto=format',
  'bowl':             'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=250&fit=crop&auto=format',
  'wrap':             'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=400&h=250&fit=crop&auto=format',
  'bread':            'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=250&fit=crop&auto=format',
  'chicken':          'https://images.unsplash.com/photo-1598103442097-8b74394b95c2?w=400&h=250&fit=crop&auto=format',
  'lamb':             'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=250&fit=crop&auto=format',
  'mushroom':         'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=250&fit=crop&auto=format',
  'vegetable':        'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=250&fit=crop&auto=format',
};

/**
 * Resolve a food image URL for a recipe by scanning the name for keywords.
 * Returns a curated Unsplash URL or a cuisine-appropriate fallback.
 */
function getRecipeImageUrl(recipeName, cuisine) {
  const nameLower = (recipeName || '').toLowerCase();
  for (const [keyword, url] of Object.entries(IMAGE_MAP)) {
    if (nameLower.includes(keyword)) return url;
  }
  // Fallback by cuisine
  const cuisineFallbacks = {
    indian:  'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=250&fit=crop&auto=format',
    chinese: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=250&fit=crop&auto=format',
    italian: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=250&fit=crop&auto=format',
    mexican: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=250&fit=crop&auto=format',
  };
  return cuisineFallbacks[(cuisine || '').toLowerCase()]
    || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=250&fit=crop&auto=format';
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initIngredientInput('ingredient-input',    'ingredient-tags',    State.ingredients);
  initIngredientInput('leftover-input',      'leftover-tags',      State.leftoverIngredients);
  initIngredientInput('shopping-have-input', 'shopping-have-tags', State.shoppingHave);
  renderQuickSuggestions();
  pollHealth();
  loadFavoriteIds();
  initParallax();
  initScrollAnimations();
});

// ─────────────────────────────────────────────────────────────────────────────
// Parallax on botanical background
// ─────────────────────────────────────────────────────────────────────────────
function initParallax() {
  const bg = document.querySelector('.botanical-svg');
  if (!bg || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const y = window.scrollY * 0.18;
        bg.style.transform = `translateY(${y}px)`;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scroll animations (fade-up)
// ─────────────────────────────────────────────────────────────────────────────
function initScrollAnimations() {
  if (!window.IntersectionObserver) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animationPlayState = 'running';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => {
    el.style.animationPlayState = 'paused';
    observer.observe(el);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav active state
// ─────────────────────────────────────────────────────────────────────────────
function setNavActive(name) {
  document.querySelectorAll('.nav-link-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`nav-${name}`);
  if (btn) btn.classList.add('active');
}

// ─────────────────────────────────────────────────────────────────────────────
// Section routing
// ─────────────────────────────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${name}`);
  if (target) target.classList.add('active');
  setNavActive(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'browse')    loadBrowse();
  if (name === 'favorites') loadFavorites();
  if (name === 'history')   loadHistory();
}

function closeOffcanvas() {
  const el = document.getElementById('mobileMenu');
  const instance = bootstrap.Offcanvas.getInstance(el);
  if (instance) instance.hide();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingredient tag input
// ─────────────────────────────────────────────────────────────────────────────
function initIngredientInput(inputId, containerId, stateArray) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      addTag(input.value.trim().replace(/,$/, ''), stateArray, containerId, inputId);
      input.value = '';
    }
    if (e.key === 'Backspace' && !input.value && stateArray.length > 0) {
      removeTag(stateArray.length - 1, stateArray, containerId, inputId);
    }
  });

  input.addEventListener('blur', () => {
    const val = input.value.trim().replace(/,$/, '');
    if (val) {
      addTag(val, stateArray, containerId, inputId);
      input.value = '';
    }
  });
}

function addTag(value, stateArray, containerId, inputId) {
  const cleaned = value.toLowerCase().trim();
  if (!cleaned || stateArray.includes(cleaned)) return;
  stateArray.push(cleaned);
  renderTags(stateArray, containerId, inputId);
}

function removeTag(index, stateArray, containerId, inputId) {
  stateArray.splice(index, 1);
  renderTags(stateArray, containerId, inputId);
}

function renderTags(stateArray, containerId, inputId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  stateArray.forEach((tag, i) => {
    const span = document.createElement('span');
    span.className = 'ingredient-tag';
    span.innerHTML = `${escHtml(tag)}<button class="remove-tag" type="button"><i class="bi bi-x"></i></button>`;
    span.querySelector('.remove-tag').onclick = (e) => {
      e.stopPropagation();
      removeTag(i, stateArray, containerId, inputId);
    };
    container.appendChild(span);
  });
}

function clearIngredients() {
  State.ingredients.length = 0;
  renderTags(State.ingredients, 'ingredient-tags', 'ingredient-input');
  document.getElementById('ingredient-input').focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick suggestions
// ─────────────────────────────────────────────────────────────────────────────
function renderQuickSuggestions() {
  const container = document.getElementById('quick-suggestions');
  if (!container) return;
  QUICK_SUGGESTIONS.forEach(s => {
    const chip = document.createElement('span');
    chip.className = 'suggestion-chip';
    chip.textContent = s;
    chip.onclick = () => addTag(s, State.ingredients, 'ingredient-tags', 'ingredient-input');
    container.appendChild(chip);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check — /api/health
// ─────────────────────────────────────────────────────────────────────────────
async function pollHealth() {
  const badge = document.getElementById('health-badge');
  if (!badge) return;
  badge.classList.remove('d-none');

  try {
    const res  = await fetch('/api/health');
    const json = await res.json();
    const data = json.data;
    const ok   = data.status === 'ok';
    badge.classList.remove('ok', 'warn', 'err');
    badge.classList.add(ok ? 'ok' : 'warn');
    badge.querySelector('.health-label').textContent = ok ? 'AI Ready' : 'Degraded';
    badge.title = ok
      ? `Vector store: ${data.vector_store?.document_count} docs | Model: ${data.ibm_granite?.model_id}`
      : 'Check IBM credentials in .env';
  } catch {
    badge.classList.add('err');
    badge.querySelector('.health-label').textContent = 'Offline';
  }
  setTimeout(pollHealth, 60000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate recipe — /api/recommend (POST)
// ─────────────────────────────────────────────────────────────────────────────
async function generateRecipe() {
  if (State.ingredients.length === 0) {
    showToast('Please add at least one ingredient.', 'error');
    document.getElementById('ingredient-input').focus();
    return;
  }

  const cuisine = document.getElementById('cuisine-filter').value || null;
  const dietary = getDietaryFilters();
  const topK    = parseInt(document.getElementById('topk-slider').value, 10);

  setGenerating(true);
  document.getElementById('result-area').classList.add('d-none');
  document.getElementById('feature-row').classList.add('d-none');
  animateLoadingSteps();

  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: State.ingredients,
        cuisine,
        dietary: dietary.length ? dietary : null,
        top_k: topK,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error + (json.details ? `: ${json.details}` : ''));
    renderResult(json.data);
  } catch (err) {
    showToast(`Generation failed: ${err.message}`, 'error');
    console.error(err);
  } finally {
    setGenerating(false);
  }
}

function getDietaryFilters() {
  return ['diet-veg','diet-vegan','diet-gf','diet-hp']
    .filter(id => document.getElementById(id)?.checked)
    .map(id => document.getElementById(id).value);
}

function setGenerating(active) {
  const btn     = document.getElementById('btn-generate');
  const loading = document.getElementById('loading-state');
  if (active) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-generate-inner"><span class="spinner-orb" style="width:20px;height:20px;border-width:2px;"></span><span>Generating…</span></span>`;
    loading.classList.remove('d-none');
  } else {
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-generate-inner"><i class="bi bi-magic"></i><span>Generate Recipe</span></span><div class="btn-ripple"></div>`;
    loading.classList.add('d-none');
  }
}

function animateLoadingSteps() {
  const steps = ['step-embed', 'step-retrieve', 'step-granite'];
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active', 'done');
  });
  let i = 0;
  const advance = () => {
    if (i > 0) {
      const prev = document.getElementById(steps[i - 1]);
      if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
    }
    if (i < steps.length) {
      const curr = document.getElementById(steps[i]);
      if (curr) curr.classList.add('active');
      i++;
      setTimeout(advance, i === 1 ? 900 : i === 2 ? 1400 : 99999);
    }
  };
  advance();
}

// ─────────────────────────────────────────────────────────────────────────────
// Render result
// ─────────────────────────────────────────────────────────────────────────────
function renderResult(data) {
  const aiBox = document.getElementById('ai-response');
  aiBox.innerHTML = formatAIText(data.generated_response || 'No response generated.');

  const container = document.getElementById('retrieved-cards');
  const countEl   = document.getElementById('retrieved-count');
  container.innerHTML = '';
  const recipes = data.retrieved_recipes || [];
  countEl.textContent = `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} retrieved`;

  recipes.forEach(recipe => {
    const div = document.createElement('div');
    div.innerHTML = buildRecipeCard(recipe.full_recipe || recipe, recipe.similarity_score);
    container.appendChild(div.firstElementChild);
  });

  document.getElementById('result-area').classList.remove('d-none');
  document.getElementById('feature-row').classList.remove('d-none');
  setTimeout(() => {
    document.getElementById('result-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,3}\s(.+)$/gm, '<strong class="d-block mt-2 mb-1">$1</strong>')
    .replace(/^(\d+)\.\s/gm, '<br><strong>$1.</strong> ')
    .replace(/\n{2,}/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p class="mb-2">')
    .replace(/$/, '</p>');
}

function copyResponse() {
  const text = document.getElementById('ai-response').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe card builder — now with real food images
// ─────────────────────────────────────────────────────────────────────────────
function buildRecipeCard(recipe, similarityScore) {
  if (!recipe) return '';
  const cuisine      = recipe.cuisine || '';
  const cuisineClass = CUISINE_CLASS[cuisine.toLowerCase()] || 'cuisine-default';
  const emoji        = CUISINE_EMOJI[cuisine] || '🍽️';
  const diffClass    = `badge-${(recipe.difficulty || 'easy').toLowerCase()}`;
  const dietary      = Array.isArray(recipe.dietary) ? recipe.dietary : (recipe.dietary || '').split(',');
  const dietBadges   = dietary.filter(Boolean).map(d =>
    `<span class="tag-pill ${DIET_CLASS[d.toLowerCase()] || ''}">${escHtml(d)}</span>`
  ).join('');
  const isFav    = State.favoriteIds.has(recipe.id);
  const imgUrl   = getRecipeImageUrl(recipe.name, recipe.cuisine);
  const imgId    = `img-${escAttr(recipe.id)}-${Math.random().toString(36).slice(2,7)}`;
  const fbId     = `fb-${escAttr(recipe.id)}-${Math.random().toString(36).slice(2,7)}`;

  const simBar = similarityScore != null ? `
    <div class="similarity-bar-wrap">
      <div class="similarity-label">
        <span>Match score</span><span>${Math.round(similarityScore * 100)}%</span>
      </div>
      <div class="similarity-bar">
        <div class="similarity-fill" style="width:${Math.round(similarityScore * 100)}%"></div>
      </div>
    </div>` : '';

  return `
    <div class="recipe-card" onclick="openRecipeModal('${escAttr(recipe.id)}')">
      <div class="recipe-card-img ${imgUrl ? '' : cuisineClass}" style="position:relative;">
        <img id="${imgId}" src="${imgUrl}" alt="${escAttr(recipe.name)}" loading="lazy"
          onerror="this.style.display='none';document.getElementById('${fbId}').style.display='flex'" />
        <div id="${fbId}" class="cuisine-banner" style="display:none;">
          <span>${emoji}</span>
        </div>
        <button class="fav-btn ${isFav ? 'active' : ''}"
          onclick="event.stopPropagation();toggleFavorite('${escAttr(recipe.id)}','${escAttr(recipe.name)}','${escAttr(cuisine)}')"
          title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          <i class="bi bi-heart${isFav ? '-fill' : ''}"></i>
        </button>
      </div>
      <div class="recipe-card-body">
        <div class="d-flex flex-wrap gap-1 mb-2">${dietBadges}</div>
        <div class="recipe-card-title">${escHtml(recipe.name)}</div>
        <div class="recipe-card-desc">${escHtml(recipe.description || `${cuisine} recipe · ${recipe.cook_time_minutes || '?'} min`)}</div>
      </div>
      ${simBar}
      <div class="recipe-card-footer">
        <span class="recipe-meta-chip"><i class="bi bi-clock me-1"></i>${recipe.cook_time_minutes || '?'} min</span>
        <span class="${diffClass}">${recipe.difficulty || ''}</span>
        <span class="recipe-meta-chip"><i class="bi bi-people me-1"></i>${recipe.servings || 2}</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe modal — /api/recipes/:id (GET)
// ─────────────────────────────────────────────────────────────────────────────
async function openRecipeModal(recipeId) {
  try {
    const res  = await fetch(`/api/recipes/${recipeId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    populateModal(json.data);
    State.currentRecipeId   = recipeId;
    State.currentRecipeName = json.data.name;
    new bootstrap.Modal(document.getElementById('recipeModal')).show();
  } catch (err) {
    showToast(`Could not load recipe: ${err.message}`, 'error');
  }
}

function populateModal(recipe) {
  document.getElementById('modal-title').textContent = recipe.name;

  // Image
  const imgTag = document.getElementById('modal-recipe-img-tag');
  const fbDiv  = document.getElementById('modal-img-fallback');
  const imgUrl = getRecipeImageUrl(recipe.name, recipe.cuisine);
  imgTag.src = imgUrl;
  imgTag.alt = recipe.name;
  imgTag.style.display = 'block';
  fbDiv.style.display  = 'none';
  // Apply cuisine gradient to fallback
  const cuisineClass = CUISINE_CLASS[(recipe.cuisine || '').toLowerCase()] || 'cuisine-default';
  fbDiv.className = `img-fallback ${cuisineClass}`;

  document.getElementById('modal-cuisine-label').textContent = recipe.cuisine;

  // Badges
  const dietary  = recipe.dietary || [];
  document.getElementById('modal-badges').innerHTML = `
    <span class="badge text-white" style="background:var(--primary);border-radius:999px;padding:.25rem .65rem;font-size:.75rem;">
      ${CUISINE_EMOJI[recipe.cuisine] || ''} ${escHtml(recipe.cuisine)}
    </span>
    ${dietary.map(d =>
      `<span class="tag-pill ${DIET_CLASS[d.toLowerCase()] || ''}">${escHtml(d)}</span>`
    ).join('')}`;

  // Meta
  document.getElementById('modal-meta').innerHTML = `
    <span><i class="bi bi-clock me-1"></i>${recipe.cook_time_minutes} min</span>
    <span><i class="bi bi-people me-1"></i>${recipe.servings} servings</span>
    <span><i class="bi bi-bar-chart me-1"></i>${recipe.difficulty}</span>`;

  // Nutrition
  const nut = recipe.nutrition || {};
  document.getElementById('modal-nutrition').innerHTML = `
    <div class="nutrition-item"><div class="nutrition-value">${nut.calories ?? '—'}</div><div class="nutrition-label">Calories</div></div>
    <div class="nutrition-item"><div class="nutrition-value">${nut.protein_g != null ? nut.protein_g + 'g' : '—'}</div><div class="nutrition-label">Protein</div></div>
    <div class="nutrition-item"><div class="nutrition-value">${nut.carbs_g != null ? nut.carbs_g + 'g' : '—'}</div><div class="nutrition-label">Carbs</div></div>
    <div class="nutrition-item"><div class="nutrition-value">${nut.fat_g != null ? nut.fat_g + 'g' : '—'}</div><div class="nutrition-label">Fat</div></div>`;

  // Stats
  document.getElementById('modal-time').textContent       = recipe.cook_time_minutes;
  document.getElementById('modal-difficulty').textContent = recipe.difficulty;
  document.getElementById('modal-servings').textContent   = recipe.servings;

  // Substitutions
  const subs = recipe.substitutions || {};
  const subsKeys = Object.keys(subs);
  document.getElementById('modal-substitutions').innerHTML = subsKeys.length
    ? `<table class="sub-table">${subsKeys.map(k =>
        `<tr><td class="sub-key">${escHtml(k)}</td><td class="sub-arrow">→</td><td class="sub-val">${escHtml(subs[k])}</td></tr>`
      ).join('')}</table>`
    : '<small class="text-muted">No substitutions listed — use the AI finder below.</small>';

  // Waste tips
  const wasteTips = recipe.waste_reduction_tips || [];
  document.getElementById('modal-waste-tips').innerHTML = wasteTips.length
    ? wasteTips.map(t =>
        `<li class="d-flex gap-2 mb-1"><i class="bi bi-recycle" style="color:var(--primary);margin-top:2px"></i><span style="font-size:.85rem">${escHtml(t)}</span></li>`
      ).join('')
    : '<li><small class="text-muted">No tips available.</small></li>';

  // Ingredients
  document.getElementById('modal-ingredients').innerHTML = (recipe.ingredients || []).map(i =>
    `<li>${escHtml(i)}</li>`
  ).join('');

  // Steps
  document.getElementById('modal-steps').innerHTML = (recipe.steps || []).map(s =>
    `<li>${escHtml(s)}</li>`
  ).join('');

  // Favorite state
  const isFav = State.favoriteIds.has(recipe.id);
  document.getElementById('modal-fav-icon').className = `bi bi-heart${isFav ? '-fill' : ''}`;
  document.getElementById('modal-fav-btn').classList.toggle('active', isFav);

  // Clear sub tool
  document.getElementById('sub-ingredient-input').value = '';
  document.getElementById('sub-result').classList.add('d-none');
}

function useRecipeIngredients() {
  if (!State.currentRecipeId) return;
  bootstrap.Modal.getInstance(document.getElementById('recipeModal'))?.hide();
  showSection('home');
  showToast('Ingredients loaded. Adjust as needed!', 'info');
}

// ─────────────────────────────────────────────────────────────────────────────
// Substitutions — /api/substitutions (POST)
// ─────────────────────────────────────────────────────────────────────────────
async function getSubstitutions() {
  const ingredient = document.getElementById('sub-ingredient-input').value.trim();
  if (!ingredient) { showToast('Enter an ingredient name to substitute.', 'error'); return; }
  if (!State.currentRecipeName) { showToast('Please open a recipe first.', 'error'); return; }

  const loading = document.getElementById('sub-loading');
  const result  = document.getElementById('sub-result');
  loading.classList.remove('d-none');
  result.classList.add('d-none');

  try {
    const res = await fetch('/api/substitutions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient,
        recipe_name: State.currentRecipeName,
        dietary: getDietaryFilters(),
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    document.getElementById('sub-result-text').innerHTML = formatAIText(json.data.suggestions);
    result.classList.remove('d-none');
  } catch (err) {
    showToast(`Substitution error: ${err.message}`, 'error');
  } finally {
    loading.classList.add('d-none');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Favorites — /api/favorites (GET/POST/DELETE)
// ─────────────────────────────────────────────────────────────────────────────
async function loadFavoriteIds() {
  try {
    const res  = await fetch('/api/favorites');
    const json = await res.json();
    State.favoriteIds = new Set((json.data.favorites || []).map(f => f.recipe_id));
  } catch { /* non-critical */ }
}

async function toggleFavorite(recipeId, recipeName, cuisine) {
  const isFav = State.favoriteIds.has(recipeId);
  try {
    if (isFav) {
      await fetch(`/api/favorites/${recipeId}`, { method: 'DELETE' });
      State.favoriteIds.delete(recipeId);
      showToast(`Removed "${recipeName}" from favourites.`, 'info');
    } else {
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipeId, recipe_name: recipeName, cuisine }),
      });
      State.favoriteIds.add(recipeId);
      showToast(`Added "${recipeName}" to favourites! ❤️`, 'success');
    }
    refreshFavButtonsInDOM(recipeId, !isFav);
  } catch {
    showToast('Could not update favourites.', 'error');
  }
}

function refreshFavButtonsInDOM(recipeId, isNowFav) {
  document.querySelectorAll('.fav-btn').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    if (onclick.includes(recipeId)) {
      btn.classList.toggle('active', isNowFav);
      btn.querySelector('i').className = `bi bi-heart${isNowFav ? '-fill' : ''}`;
    }
  });
  if (State.currentRecipeId === recipeId) {
    const modalIcon = document.getElementById('modal-fav-icon');
    const modalBtn  = document.getElementById('modal-fav-btn');
    if (modalIcon) modalIcon.className = `bi bi-heart${isNowFav ? '-fill' : ''}`;
    if (modalBtn)  modalBtn.classList.toggle('active', isNowFav);
  }
}

async function toggleFavoriteModal() {
  if (!State.currentRecipeId) return;
  const name    = document.getElementById('modal-title').textContent;
  const cuisine = document.querySelector('#modal-badges .badge')?.textContent?.trim().replace(/^.{1,4}\s/, '') || '';
  await toggleFavorite(State.currentRecipeId, name, cuisine);
}

async function loadFavorites() {
  const listEl  = document.getElementById('favorites-list');
  const emptyEl = document.getElementById('favorites-empty');
  listEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem"><div class="spinner-orb mx-auto"></div></div>';

  try {
    const res  = await fetch('/api/favorites');
    const json = await res.json();
    const favs = json.data.favorites || [];

    if (favs.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('d-none');
      return;
    }
    emptyEl.classList.add('d-none');
    listEl.innerHTML = '';

    await Promise.all(favs.map(async fav => {
      try {
        const r  = await fetch(`/api/recipes/${fav.recipe_id}`);
        const rj = await r.json();
        const div = document.createElement('div');
        div.innerHTML = buildRecipeCard(rj.data);
        listEl.appendChild(div.firstElementChild);
      } catch {
        const div = document.createElement('div');
        div.className = 'glass-card p-3';
        div.innerHTML = `<strong>${escHtml(fav.name || fav.recipe_id)}</strong>`;
        listEl.appendChild(div);
      }
    }));
  } catch (err) {
    listEl.innerHTML = `<div style="grid-column:1/-1"><div class="alert alert-danger">Failed: ${err.message}</div></div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// History — /api/history (GET/DELETE)
// ─────────────────────────────────────────────────────────────────────────────
async function loadHistory() {
  const listEl  = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');

  try {
    const res  = await fetch('/api/history');
    const json = await res.json();
    const hist = json.data.history || [];

    if (hist.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('d-none');
      return;
    }
    emptyEl.classList.add('d-none');
    listEl.innerHTML = hist.map((item, i) => `
      <div class="history-item" onclick="replayHistory(${JSON.stringify(item).replace(/"/g,'&quot;')})">
        <div class="history-num">${i + 1}</div>
        <div class="flex-grow-1">
          <div style="font-weight:600;font-size:.9rem">${escHtml(item.top_recipe || 'Unknown recipe')}</div>
          <div style="font-size:.8rem;color:var(--text-muted)">
            ${escHtml((item.ingredients || []).join(', '))}
          </div>
          ${item.filters?.cuisine ? `<span class="tag-pill tag-vegetarian mt-1" style="display:inline-block">${escHtml(item.filters.cuisine)}</span>` : ''}
        </div>
        <div style="font-size:.75rem;color:var(--text-muted);white-space:nowrap">${formatRelativeTime(item.timestamp)}</div>
      </div>`).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">Failed to load history: ${err.message}</div>`;
  }
}

function replayHistory(item) {
  State.ingredients.length = 0;
  (item.ingredients || []).forEach(i => State.ingredients.push(i));
  renderTags(State.ingredients, 'ingredient-tags', 'ingredient-input');
  if (item.filters?.cuisine) document.getElementById('cuisine-filter').value = item.filters.cuisine;
  showSection('home');
  generateRecipe();
}

async function clearHistory() {
  try {
    await fetch('/api/history', { method: 'DELETE' });
    loadHistory();
    showToast('History cleared.', 'info');
  } catch {
    showToast('Failed to clear history.', 'error');
  }
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Browse — /api/recipes (GET)
// ─────────────────────────────────────────────────────────────────────────────
async function loadBrowse() {
  const cuisine  = document.getElementById('browse-cuisine')?.value || '';
  const dietary  = document.getElementById('browse-dietary')?.value || '';
  const container = document.getElementById('browse-cards');
  const emptyEl   = document.getElementById('browse-empty');
  if (!container) return;

  container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem"><div class="spinner-orb mx-auto"></div></div>';
  emptyEl.classList.add('d-none');

  try {
    let url = '/api/recipes?limit=100';
    if (cuisine) url += `&cuisine=${encodeURIComponent(cuisine)}`;
    if (dietary) url += `&dietary=${encodeURIComponent(dietary)}`;

    const res  = await fetch(url);
    const json = await res.json();
    State.browseRecipes = json.data.recipes || [];
    document.getElementById('browse-count').textContent =
      `Showing ${State.browseRecipes.length} recipe${State.browseRecipes.length !== 1 ? 's' : ''}`;
    filterBrowseLocal();
  } catch (err) {
    container.innerHTML = `<div style="grid-column:1/-1"><div class="alert alert-danger">Failed: ${err.message}</div></div>`;
  }
}

function filterBrowseLocal() {
  const difficulty = document.getElementById('browse-difficulty')?.value.toLowerCase() || '';
  const search     = (document.getElementById('browse-search')?.value || '').toLowerCase();
  const container  = document.getElementById('browse-cards');
  const emptyEl    = document.getElementById('browse-empty');
  if (!container) return;

  let filtered = State.browseRecipes;
  if (difficulty) filtered = filtered.filter(r => (r.difficulty || '').toLowerCase() === difficulty);
  if (search)     filtered = filtered.filter(r =>
    (r.name || '').toLowerCase().includes(search) || (r.description || '').toLowerCase().includes(search)
  );

  document.getElementById('browse-count').textContent =
    `Showing ${filtered.length} recipe${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyEl.classList.remove('d-none');
    return;
  }
  emptyEl.classList.add('d-none');
  container.innerHTML = '';
  filtered.forEach(r => {
    const div = document.createElement('div');
    div.innerHTML = buildRecipeCard(r);
    container.appendChild(div.firstElementChild);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Leftover modal — /api/leftover (POST)
// ─────────────────────────────────────────────────────────────────────────────
function openLeftoverModal() {
  State.leftoverIngredients.length = 0;
  renderTags(State.leftoverIngredients, 'leftover-tags', 'leftover-input');
  document.getElementById('leftover-result').classList.add('d-none');
  new bootstrap.Modal(document.getElementById('leftoverModal')).show();
}

async function submitLeftover() {
  if (State.leftoverIngredients.length === 0) {
    showToast('Add at least one leftover ingredient.', 'error');
    return;
  }

  const cuisine  = document.getElementById('leftover-cuisine').value || null;
  const loading  = document.getElementById('leftover-loading');
  const result   = document.getElementById('leftover-result');
  loading.classList.remove('d-none');
  result.classList.add('d-none');

  try {
    const res = await fetch('/api/leftover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients: State.leftoverIngredients, cuisine }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    document.getElementById('leftover-result-text').innerHTML = formatAIText(json.data.suggestions);

    const simCards = document.getElementById('leftover-similar-cards');
    simCards.innerHTML = '';
    (json.data.similar_recipes || []).forEach(r => {
      const div = document.createElement('div');
      div.innerHTML = buildRecipeCard(r.full_recipe || r);
      simCards.appendChild(div.firstElementChild);
    });

    result.classList.remove('d-none');
  } catch (err) {
    showToast(`Leftover ideas failed: ${err.message}`, 'error');
  } finally {
    loading.classList.add('d-none');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopping list — /api/shopping-list (POST)
// ─────────────────────────────────────────────────────────────────────────────
function openShoppingList() {
  if (!State.currentRecipeId) return;
  State.shoppingHave.length = 0;
  State.ingredients.forEach(i => State.shoppingHave.push(i));
  renderTags(State.shoppingHave, 'shopping-have-tags', 'shopping-have-input');
  document.getElementById('shopping-result').classList.add('d-none');
  new bootstrap.Modal(document.getElementById('shoppingModal')).show();
}

async function submitShoppingList() {
  if (!State.currentRecipeId) return;
  const loading = document.getElementById('shopping-loading');
  const result  = document.getElementById('shopping-result');
  loading.classList.remove('d-none');
  result.classList.add('d-none');

  try {
    const res = await fetch('/api/shopping-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: State.currentRecipeId, ingredients: State.shoppingHave }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    const data    = json.data;
    const badgesEl = document.getElementById('shopping-missing-badges');
    badgesEl.innerHTML = (data.missing_ingredients || []).map(i =>
      `<span class="badge" style="background:rgba(220,38,38,.1);color:#dc2626;border-radius:999px;padding:.25rem .65rem;font-size:.75rem;">${escHtml(i)}</span>`
    ).join('') || '<span style="color:var(--primary);font-size:.875rem">You have everything! 🎉</span>';

    document.getElementById('shopping-result-text').innerHTML = formatAIText(data.shopping_list);
    result.classList.remove('d-none');
  } catch (err) {
    showToast(`Shopping list failed: ${err.message}`, 'error');
  } finally {
    loading.classList.add('d-none');
  }
}

function copyShoppingList() {
  const text = document.getElementById('shopping-result-text').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Shopping list copied!', 'success'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast notifications
// ─────────────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const id = `toast-${Date.now()}`;
  const icons  = { success: 'bi-check-circle-fill', error: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
  const colors = { success: 'var(--primary)', error: '#dc2626', info: 'var(--accent)' };

  const div = document.createElement('div');
  div.id = id;
  div.className = `toast show align-items-center`;
  div.setAttribute('role', 'alert');
  div.style.borderLeftColor = colors[type] || colors.info;
  div.style.borderLeftWidth = '3px';
  div.style.borderLeftStyle = 'solid';
  div.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi ${icons[type]}" style="color:${colors[type]}"></i>
        <span style="font-size:.875rem;font-family:'DM Sans',sans-serif">${escHtml(message)}</span>
      </div>
      <button type="button" class="btn-close me-2 m-auto" onclick="document.getElementById('${id}').remove()"></button>
    </div>`;
  container.appendChild(div);
  setTimeout(() => div.remove(), 4500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Security helpers
// ─────────────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escAttr(str) {
  return String(str ?? '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
