/**
 * app.js — RecipeAI Frontend
 * ──────────────────────────
 * Handles all client-side logic:
 *  - Ingredient tag input (Enter / comma to add, Backspace to remove)
 *  - Recipe recommendation via /api/recommend
 *  - Recipe detail modal population
 *  - Favorites (add/remove via /api/favorites)
 *  - History (load/clear via /api/history)
 *  - Browse section with local filtering
 *  - Leftover ideas modal
 *  - Shopping list modal
 *  - AI Substitution tool in recipe modal
 *  - Dark / light mode toggle (persisted in localStorage)
 *  - Health status badge polling
 *  - Toast notification system
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
const State = {
  ingredients:        [],   // home ingredient list
  leftoverIngredients:[],   // leftover modal list
  shoppingHave:       [],   // shopping modal list
  currentRecipeId:    null, // open in modal
  currentRecipeName:  null,
  browseRecipes:      [],   // raw browse dataset (for local filter)
  favoriteIds:        new Set(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add ingredient suggestions
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  'chicken', 'eggs', 'garlic', 'onion', 'tomato',
  'rice', 'pasta', 'paneer', 'tofu', 'potatoes',
  'lentils', 'chickpeas', 'spinach', 'bell pepper', 'ginger',
];

const CUISINE_EMOJI = { Indian:'🇮🇳', Chinese:'🇨🇳', Italian:'🇮🇹', Mexican:'🇲🇽' };
const CUISINE_CLASS = {
  indian:'cuisine-indian', chinese:'cuisine-chinese',
  italian:'cuisine-italian', mexican:'cuisine-mexican',
};
const DIET_CLASS = {
  'vegetarian':'tag-vegetarian', 'vegan':'tag-vegan',
  'gluten-free':'tag-gluten-free', 'high protein':'tag-high-protein',
};

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initIngredientInput('ingredient-input', 'ingredient-tags', State.ingredients);
  initIngredientInput('leftover-input',   'leftover-tags',   State.leftoverIngredients);
  initIngredientInput('shopping-have-input', 'shopping-have-tags', State.shoppingHave);
  renderQuickSuggestions();
  pollHealth();
  loadFavoriteIds();
});

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────
function initTheme() {
  const stored = localStorage.getItem('theme') || 'light';
  applyTheme(stored);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-bs-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section routing
// ─────────────────────────────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${name}`);
  if (target) target.classList.add('active');
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
// Ingredient tag input (reusable for 3 different inputs)
// ─────────────────────────────────────────────────────────────────────────────
function initIngredientInput(inputId, containerId, stateArray) {
  const input     = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!input || !container) return;

  // Click on wrapper focuses input
  input.closest('.ingredient-input-wrapper')?.addEventListener('click', () => input.focus());

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

  // Also add on blur if there's text
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
    span.innerHTML = `${escHtml(tag)}<button class="remove-tag" onclick="removeTag(${i},
      window._tagState_${containerId}, '${containerId}', '${inputId}')" type="button">
      <i class="bi bi-x"></i></button>`;
    // Attach directly to avoid eval
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
    chip.onclick = () => {
      addTag(s, State.ingredients, 'ingredient-tags', 'ingredient-input');
    };
    container.appendChild(chip);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
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
    const label = badge.querySelector('.health-label');

    badge.classList.remove('ok', 'warn', 'err');
    badge.classList.add(ok ? 'ok' : 'warn');
    label.textContent = ok ? 'AI Ready' : 'Degraded';
    badge.title = ok
      ? `Vector store: ${data.vector_store?.document_count} docs | Model: ${data.ibm_granite?.model_id}`
      : 'Check IBM credentials in .env';
  } catch {
    const dot = badge.querySelector('.health-dot');
    badge.classList.add('err');
    badge.querySelector('.health-label').textContent = 'Offline';
  }

  // Re-poll every 60 seconds
  setTimeout(pollHealth, 60000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate recipe (core RAG call)
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

  // UI: show loading, hide result
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

    if (!json.success) {
      throw new Error(json.error + (json.details ? `: ${json.details}` : ''));
    }

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
  const btn = document.getElementById('btn-generate');
  const loading = document.getElementById('loading-state');
  if (active) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
    loading.classList.remove('d-none');
  } else {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-magic me-2"></i>Generate Recipe';
    loading.classList.add('d-none');
  }
}

// Animate loading steps sequentially
function animateLoadingSteps() {
  const steps = ['step-embed', 'step-retrieve', 'step-granite'];
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('active', 'done'); }
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
  // AI response
  const aiBox = document.getElementById('ai-response');
  aiBox.innerHTML = formatAIText(data.generated_response || 'No response generated.');

  // Retrieved recipe cards
  const container = document.getElementById('retrieved-cards');
  const countEl   = document.getElementById('retrieved-count');
  container.innerHTML = '';
  const recipes = data.retrieved_recipes || [];
  countEl.textContent = `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} retrieved`;

  recipes.forEach(recipe => {
    const col = document.createElement('div');
    col.className = 'col-sm-6 col-lg-4';
    col.innerHTML = buildRecipeCard(recipe.full_recipe || recipe, recipe.similarity_score);
    container.appendChild(col);
  });

  // Show result area
  document.getElementById('result-area').classList.remove('d-none');
  document.getElementById('feature-row').classList.remove('d-none');

  // Smooth scroll to result
  setTimeout(() => {
    document.getElementById('result-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Format AI markdown-lite text to HTML
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
// Recipe card builder (shared by Browse + Retrieved + Leftover)
// ─────────────────────────────────────────────────────────────────────────────
function buildRecipeCard(recipe, similarityScore) {
  if (!recipe) return '';
  const cuisineClass = CUISINE_CLASS[(recipe.cuisine || '').toLowerCase()] || 'cuisine-indian';
  const emoji        = CUISINE_EMOJI[recipe.cuisine] || '🍽️';
  const diffClass    = `badge-${(recipe.difficulty || 'easy').toLowerCase()}`;
  const dietary      = Array.isArray(recipe.dietary) ? recipe.dietary : (recipe.dietary || '').split(',');
  const dietBadges   = dietary.filter(Boolean).map(d =>
    `<span class="tag-pill ${DIET_CLASS[d.toLowerCase()] || ''}">${escHtml(d)}</span>`
  ).join('');
  const isFav = State.favoriteIds.has(recipe.id);

  const simBar = similarityScore != null ? `
    <div class="similarity-bar-wrap px-1 pb-2">
      <div class="similarity-label">
        <span>Match score</span>
        <span>${Math.round(similarityScore * 100)}%</span>
      </div>
      <div class="similarity-bar">
        <div class="similarity-fill" style="width:${Math.round(similarityScore * 100)}%"></div>
      </div>
    </div>` : '';

  return `
    <div class="recipe-card" onclick="openRecipeModal('${escAttr(recipe.id)}')">
      <div class="recipe-card-img ${cuisineClass}" style="position:relative;">
        <span style="font-size:3rem;">${emoji}</span>
        <button class="fav-btn ${isFav ? 'active' : ''}"
          onclick="event.stopPropagation();toggleFavorite('${escAttr(recipe.id)}','${escAttr(recipe.name)}','${escAttr(recipe.cuisine)}')"
          title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          <i class="bi bi-heart${isFav ? '-fill' : ''}"></i>
        </button>
      </div>
      <div class="recipe-card-body">
        <div class="d-flex flex-wrap gap-1 mb-2">${dietBadges}</div>
        <div class="recipe-card-title">${escHtml(recipe.name)}</div>
        <div class="recipe-card-desc">${escHtml(recipe.description || '')}</div>
      </div>
      ${simBar}
      <div class="recipe-card-footer">
        <span class="recipe-meta-chip"><i class="bi bi-clock me-1"></i>${recipe.cook_time_minutes || '?'} min</span>
        <span class="badge rounded-pill ${diffClass}" style="font-size:.7rem;">${recipe.difficulty || ''}</span>
        <span class="recipe-meta-chip"><i class="bi bi-people me-1"></i>${recipe.servings || 2}</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe detail modal
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
  // Title & meta
  document.getElementById('modal-title').textContent = recipe.name;

  // Cuisine badge + dietary badges
  const badgesEl = document.getElementById('modal-badges');
  const dietary  = recipe.dietary || [];
  badgesEl.innerHTML = `
    <span class="badge text-white" style="background:var(--brand-primary)">
      ${CUISINE_EMOJI[recipe.cuisine] || ''} ${recipe.cuisine}
    </span>
    ${dietary.map(d =>
      `<span class="tag-pill ${DIET_CLASS[d.toLowerCase()] || ''}">${escHtml(d)}</span>`
    ).join('')}`;

  // Meta row
  document.getElementById('modal-meta').innerHTML = `
    <span><i class="bi bi-clock me-1"></i>${recipe.cook_time_minutes} min</span>
    <span><i class="bi bi-people me-1"></i>${recipe.servings} servings</span>
    <span><i class="bi bi-bar-chart me-1"></i>${recipe.difficulty}</span>`;

  // Image placeholder
  const cuisineClass = CUISINE_CLASS[(recipe.cuisine || '').toLowerCase()] || 'cuisine-indian';
  const imgBox = document.getElementById('modal-img-placeholder');
  imgBox.className = `recipe-image-placeholder mb-3 ${cuisineClass}`;
  document.getElementById('modal-cuisine-label').textContent = recipe.cuisine;

  // Nutrition
  const nut = recipe.nutrition || {};
  document.getElementById('modal-nutrition').innerHTML = `
    <div class="nutrition-item"><div class="nutrition-value">${nut.calories || '—'}</div><div class="nutrition-label">Calories</div></div>
    <div class="nutrition-item"><div class="nutrition-value">${nut.protein_g || '—'}g</div><div class="nutrition-label">Protein</div></div>
    <div class="nutrition-item"><div class="nutrition-value">${nut.carbs_g || '—'}g</div><div class="nutrition-label">Carbs</div></div>
    <div class="nutrition-item"><div class="nutrition-value">${nut.fat_g || '—'}g</div><div class="nutrition-label">Fat</div></div>`;

  // Stats
  document.getElementById('modal-time').textContent       = recipe.cook_time_minutes;
  document.getElementById('modal-difficulty').textContent = recipe.difficulty;
  document.getElementById('modal-servings').textContent   = recipe.servings;

  // Substitutions
  const subs = recipe.substitutions || {};
  const subsKeys = Object.keys(subs);
  document.getElementById('modal-substitutions').innerHTML = subsKeys.length
    ? `<table class="sub-table">${subsKeys.map(k =>
        `<tr><td class="sub-key">${escHtml(k)}</td>
             <td class="sub-arrow">→</td>
             <td class="sub-val">${escHtml(subs[k])}</td></tr>`
      ).join('')}</table>`
    : '<small class="text-muted">No substitutions listed.</small>';

  // Waste tips
  const wasteTips = recipe.waste_reduction_tips || [];
  document.getElementById('modal-waste-tips').innerHTML = wasteTips.map(t =>
    `<li class="d-flex gap-2 mb-1"><i class="bi bi-recycle text-success mt-1"></i><span style="font-size:.85rem">${escHtml(t)}</span></li>`
  ).join('');

  // Ingredients
  document.getElementById('modal-ingredients').innerHTML = (recipe.ingredients || []).map(i =>
    `<li>${escHtml(i)}</li>`
  ).join('');

  // Steps
  document.getElementById('modal-steps').innerHTML = (recipe.steps || []).map(s =>
    `<li>${escHtml(s)}</li>`
  ).join('');

  // Favorite button state
  const isFav = State.favoriteIds.has(recipe.id);
  document.getElementById('modal-fav-icon').className = `bi bi-heart${isFav ? '-fill' : ''}`;
  document.getElementById('modal-fav-btn').classList.toggle('active', isFav);

  // Clear substitution tool
  document.getElementById('sub-ingredient-input').value = '';
  document.getElementById('sub-result').classList.add('d-none');
}

function useRecipeIngredients() {
  // Prefill home ingredient input with the recipe's ingredients (simplified names)
  if (!State.currentRecipeId) return;
  bootstrap.Modal.getInstance(document.getElementById('recipeModal'))?.hide();
  showSection('home');
  showToast('Recipe ingredients loaded into the search bar. Adjust as needed!', 'info');
}

// ─────────────────────────────────────────────────────────────────────────────
// Substitutions (AI tool inside modal)
// ─────────────────────────────────────────────────────────────────────────────
async function getSubstitutions() {
  const ingredient = document.getElementById('sub-ingredient-input').value.trim();
  if (!ingredient) {
    showToast('Enter an ingredient name to substitute.', 'error');
    return;
  }
  if (!State.currentRecipeName) {
    showToast('Please open a recipe first.', 'error');
    return;
  }

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

    document.getElementById('sub-result-text').innerHTML =
      formatAIText(json.data.suggestions);
    result.classList.remove('d-none');
  } catch (err) {
    showToast(`Substitution error: ${err.message}`, 'error');
  } finally {
    loading.classList.add('d-none');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Favorites
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
      showToast(`Removed "${recipeName}" from favorites.`, 'info');
    } else {
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipeId, recipe_name: recipeName, cuisine }),
      });
      State.favoriteIds.add(recipeId);
      showToast(`Added "${recipeName}" to favorites! ❤️`, 'success');
    }
    // Refresh all visible cards
    refreshFavButtonsInDOM(recipeId, !isFav);
  } catch (err) {
    showToast('Could not update favorites.', 'error');
  }
}

function refreshFavButtonsInDOM(recipeId, isNowFav) {
  document.querySelectorAll('.fav-btn').forEach(btn => {
    const card = btn.closest('.recipe-card');
    if (!card) return;
    const onclick = btn.getAttribute('onclick') || '';
    if (onclick.includes(recipeId)) {
      btn.classList.toggle('active', isNowFav);
      btn.querySelector('i').className = `bi bi-heart${isNowFav ? '-fill' : ''}`;
    }
  });
  // Update modal button too
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
  listEl.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-primary"></div></div>';

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

    // Fetch full recipe data for each favorite
    listEl.innerHTML = '';
    await Promise.all(favs.map(async fav => {
      const col = document.createElement('div');
      col.className = 'col-sm-6 col-lg-4';
      try {
        const r  = await fetch(`/api/recipes/${fav.recipe_id}`);
        const rj = await r.json();
        col.innerHTML = buildRecipeCard(rj.data);
      } catch {
        col.innerHTML = `<div class="card p-3"><strong>${escHtml(fav.name)}</strong></div>`;
      }
      listEl.appendChild(col);
    }));
  } catch (err) {
    listEl.innerHTML = `<div class="col-12"><div class="alert alert-danger">Failed to load favorites: ${err.message}</div></div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// History
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
          <div class="fw-semibold small">${escHtml(item.top_recipe || 'Unknown recipe')}</div>
          <div class="text-muted" style="font-size:.8rem;">
            Ingredients: ${escHtml((item.ingredients || []).join(', '))}
          </div>
          ${item.filters?.cuisine ? `<span class="tag-pill tag-vegetarian mt-1">${escHtml(item.filters.cuisine)}</span>` : ''}
        </div>
        <div class="text-muted" style="font-size:.75rem;">${formatRelativeTime(item.timestamp)}</div>
      </div>`).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">Failed to load history: ${err.message}</div>`;
  }
}

function replayHistory(item) {
  // Pre-fill ingredients and run again
  State.ingredients.length = 0;
  (item.ingredients || []).forEach(i => State.ingredients.push(i));
  renderTags(State.ingredients, 'ingredient-tags', 'ingredient-input');

  if (item.filters?.cuisine) {
    document.getElementById('cuisine-filter').value = item.filters.cuisine;
  }
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
// Browse
// ─────────────────────────────────────────────────────────────────────────────
async function loadBrowse() {
  const cuisine = document.getElementById('browse-cuisine')?.value || '';
  const dietary = document.getElementById('browse-dietary')?.value || '';
  const container = document.getElementById('browse-cards');
  const emptyEl   = document.getElementById('browse-empty');
  if (!container) return;

  container.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div></div>';
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
    container.innerHTML = `<div class="col-12"><div class="alert alert-danger">Failed: ${err.message}</div></div>`;
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
    (r.name || '').toLowerCase().includes(search) ||
    (r.description || '').toLowerCase().includes(search)
  );

  document.getElementById('browse-count').textContent =
    `Showing ${filtered.length} recipe${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyEl.classList.remove('d-none');
    return;
  }
  emptyEl.classList.add('d-none');
  container.innerHTML = filtered.map(r =>
    `<div class="col-sm-6 col-lg-4">${buildRecipeCard(r)}</div>`
  ).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Leftover modal
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
      body: JSON.stringify({
        ingredients: State.leftoverIngredients,
        cuisine,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    document.getElementById('leftover-result-text').innerHTML =
      formatAIText(json.data.suggestions);

    // Similar recipe mini-cards
    const simCards = document.getElementById('leftover-similar-cards');
    simCards.innerHTML = (json.data.similar_recipes || []).map(r =>
      `<div class="col-sm-6">${buildRecipeCard(r.full_recipe || r)}</div>`
    ).join('');

    result.classList.remove('d-none');
  } catch (err) {
    showToast(`Leftover ideas failed: ${err.message}`, 'error');
  } finally {
    loading.classList.add('d-none');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopping list modal
// ─────────────────────────────────────────────────────────────────────────────
function openShoppingList() {
  if (!State.currentRecipeId) return;
  State.shoppingHave.length = 0;
  // Pre-populate with user's current ingredients
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
      body: JSON.stringify({
        recipe_id:   State.currentRecipeId,
        ingredients: State.shoppingHave,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    const data = json.data;

    // Missing badges
    const badgesEl = document.getElementById('shopping-missing-badges');
    badgesEl.innerHTML = (data.missing_ingredients || []).map(i =>
      `<span class="badge bg-danger">${escHtml(i)}</span>`
    ).join('') || '<span class="text-success">You have everything! 🎉</span>';

    document.getElementById('shopping-result-text').innerHTML =
      formatAIText(data.shopping_list);

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
  const id        = `toast-${Date.now()}`;
  const icons     = { success: 'bi-check-circle-fill', error: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
  const colors    = { success: '#10b981', error: '#ef4444', info: '#4f46e5' };

  const div = document.createElement('div');
  div.id        = id;
  div.className = `toast toast-${type} show align-items-center`;
  div.setAttribute('role', 'alert');
  div.style.borderLeftColor = colors[type] || '#4f46e5';
  div.style.borderLeftWidth = '3px';
  div.style.borderLeftStyle = 'solid';
  div.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi ${icons[type]}" style="color:${colors[type]}"></i>
        <span style="font-size:.875rem;">${escHtml(message)}</span>
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
