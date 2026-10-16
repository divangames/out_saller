// Поиск по названию и артикулу, форма и страница результатов для обоих сайтов.
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>';
const searchCloseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const searchIndex = new WeakMap();
const searchPreviewLimit = 5;
const searchUi = { draft: null, events: null };

/** Нормализует регистр, «ё», пробелы и разделители пользовательского запроса. */
function normalizeProductQuery(value) {
  return String(value).normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Находит все слова запроса в названии/артикуле; точный артикул идёт первым. */
function findSearchProducts(query) {
  const normalized = normalizeProductQuery(query);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/);
  return products.filter((product) => {
    if (!searchIndex.has(product)) searchIndex.set(product, normalizeProductQuery(`${product.name} ${product.article}`));
    return tokens.every((token) => searchIndex.get(product).includes(token));
  }).sort((a, b) => {
    const rank = (item) => item.article === normalized ? 0 : item.article.startsWith(normalized) ? 1 : 2;
    return rank(a) - rank(b);
  });
}

/** Выводит компактную кнопку поиска в основном или мобильном меню. */
function searchToggle(mobile = false) {
  return `<button type="button" class="search-toggle" data-search-toggle aria-label="Поиск товаров" aria-expanded="false" aria-controls="product-search-panel"><span class="search-toggle-icon">${searchIcon}</span>${mobile ? '<small>Поиск</small>' : ""}</button>`;
}

/** Выводит скрытую панель с формой и областью подсказок без сдвига страницы. */
function searchForm() {
  const draft = searchUi.draft ?? state.searchQuery;
  return `<section id="product-search-panel" class="search-panel" aria-label="Поиск по каталогу" hidden><div class="search-panel-head"><h2>Поиск товаров</h2><button class="search-panel-close" type="button" aria-label="Закрыть поиск">${searchCloseIcon}</button></div><form class="site-search" role="search" aria-label="Поиск товаров"><label class="search-field"><span class="search-label">Название или артикул товара</span>${searchIcon}<input id="product-search" name="q" type="search" enterkeyhint="search" autocomplete="off" maxlength="160" placeholder="Название или артикул" value="${escapeHtml(draft)}" aria-controls="search-suggestions" aria-describedby="search-summary" /></label><button class="search-clear" type="button" aria-label="Очистить поиск" ${draft ? "" : "hidden"}>${searchCloseIcon}</button><button class="search-submit" type="submit">Найти</button></form><p id="search-summary" class="search-summary" role="status" aria-live="polite"></p><ul id="search-suggestions" class="search-suggestions" aria-label="Найденные товары"></ul><button id="search-show-all" class="search-show-all" type="button" hidden>Показать весь список <span></span></button></section>`;
}

/** Строит результаты из существующих карточек, сохраняя их стиль и корзину. */
function searchView() {
  const matches = findSearchProducts(state.searchQuery);
  const visible = matches.slice(0, state.visibleCount);
  const query = escapeHtml(state.searchQuery);
  const count = matches.length.toLocaleString("ru-RU");
  return `<div class="catalog-view search-view content-width"><header class="catalog-title search-title"><h1>Результаты поиска</h1><p role="status">${state.searchQuery ? `По запросу «${query}»: ${count}` : "По всему каталогу"}</p></header>${visible.length ? `<div class="product-grid">${visible.map((product) => productCard(product)).join("")}</div>${visible.length < matches.length ? '<button class="load-more" id="load-more">Показать ещё</button>' : ""}` : `<div class="catalog-empty search-empty">${searchIcon}<h2>${state.searchQuery ? "Ничего не найдено" : "Что будем искать?"}</h2><p>${state.searchQuery ? "Проверьте название или артикул. Можно ввести только часть названия или номера." : "Введите название товара или артикул в строке поиска."}</p><button type="button" id="search-again">${state.searchQuery ? "Изменить запрос" : "Перейти к поиску"}</button></div>`}</div>`;
}

/** Раскрывает меню, обновляет подсказки при вводе и поддерживает клавиатуру. */
function bindProductSearch() {
  searchUi.events?.abort();
  searchUi.events = new AbortController();
  const { signal } = searchUi.events;
  const panel = document.querySelector("#product-search-panel");
  const form = document.querySelector(".site-search");
  const input = form?.querySelector("input");
  const clear = form?.querySelector(".search-clear");
  const suggestions = document.querySelector("#search-suggestions");
  const summary = document.querySelector("#search-summary");
  const showAll = document.querySelector("#search-show-all");
  const toggles = [...document.querySelectorAll("[data-search-toggle]")];
  let opener = null;
  if (!input || !panel) return;

  /** Привязывает десктопную панель к меню; на телефоне положение задаётся CSS. */
  const positionPanel = () => {
    if (panel.hidden || window.innerWidth < 768) return;
    const header = document.querySelector(".desktop-header").getBoundingClientRect();
    const width = Math.min(620, window.innerWidth - 32);
    panel.style.setProperty("--search-left", `${Math.max(16, Math.min(header.right - width, window.innerWidth - width - 16))}px`);
    panel.style.setProperty("--search-top", `${Math.max(12, header.bottom + 8)}px`);
  };

  /** Показывает не более пяти товаров, а остальные доступны в полном списке. */
  const updateSuggestions = () => {
    searchUi.draft = input.value;
    clear.hidden = !input.value;
    const query = normalizeProductQuery(input.value);
    const matches = findSearchProducts(input.value);
    summary.textContent = !query ? "Введите название или артикул товара" : matches.length ? `Найдено товаров: ${matches.length.toLocaleString("ru-RU")}` : "Ничего не найдено. Попробуйте другое название или артикул.";
    suggestions.innerHTML = matches.slice(0, searchPreviewLimit).map((product) => {
      const productPath = `/product/${encodeURIComponent(product.article)}`;
      const href = usesHashRouting ? `#${productPath.slice(1)}` : productPath;
      return `<li><a class="search-suggestion" href="${href}" data-search-product="${escapeHtml(product.id)}"><img src="${escapeHtml(product.image)}" alt="" width="52" height="52" /><span class="search-suggestion-copy"><strong>${escapeHtml(product.name)}</strong><small>арт. ${escapeHtml(product.article)}</small></span><span class="search-suggestion-price"><b>${currentProductPrice(product)}</b><small>Скидка ${discountInfo().discount}%</small></span></a></li>`;
    }).join("");
    suggestions.hidden = !matches.length;
    showAll.hidden = matches.length <= searchPreviewLimit;
    showAll.querySelector("span").textContent = matches.length.toLocaleString("ru-RU");
  };

  /** Закрывает панель и при необходимости возвращает фокус к иконке меню. */
  const closePanel = (restoreFocus = true) => {
    panel.hidden = true;
    toggles.forEach((toggle) => toggle.setAttribute("aria-expanded", "false"));
    if (restoreFocus) opener?.focus({ preventScroll: true });
  };

  /** Раскрывает поиск без перерисовки страницы и потери положения прокрутки. */
  const openPanel = (toggle = toggles.find((node) => node.getClientRects().length)) => {
    opener = toggle;
    panel.hidden = false;
    toggles.forEach((node) => node.setAttribute("aria-expanded", "true"));
    positionPanel();
    updateSuggestions();
    input.focus({ preventScroll: true });
  };

  /** Переходит от короткой выдачи ко всем результатам текущего запроса. */
  const submitSearch = () => {
    const query = input.value.trim().slice(0, 160);
    if (!normalizeProductQuery(query)) { input.focus(); return; }
    searchUi.draft = query;
    closePanel(false);
    navigate("search", { beforeEnter: () => { state.searchQuery = query; state.visibleCount = 18; } });
    const heading = document.querySelector(".search-title h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  };

  toggles.forEach((toggle) => toggle.addEventListener("click", () => panel.hidden ? openPanel(toggle) : closePanel()));
  input.addEventListener("input", (event) => { if (!event.isComposing) updateSuggestions(); });
  input.addEventListener("compositionend", updateSuggestions);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); suggestions.querySelector("a")?.focus(); }
  });
  suggestions.addEventListener("keydown", (event) => {
    const links = [...suggestions.querySelectorAll("a")];
    const index = links.indexOf(document.activeElement);
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && index <= 0) input.focus();
    else links[Math.min(links.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
  });
  suggestions.addEventListener("click", (event) => {
    const link = event.target.closest("[data-search-product]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const product = products.find((item) => item.id === link.dataset.searchProduct);
    if (!product) return;
    event.preventDefault();
    closePanel(false);
    navigate("product", { beforeEnter: () => { state.selectedProduct = product; state.selectedSize = null; state.galleryIndex = 0; } });
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); submitSearch(); });
  showAll.addEventListener("click", submitSearch);
  clear.addEventListener("click", () => {
    input.value = "";
    updateSuggestions();
    input.focus({ preventScroll: true });
  });
  panel.querySelector(".search-panel-close").addEventListener("click", () => closePanel());
  document.querySelector("#search-again")?.addEventListener("click", () => {
    openPanel();
    input.select();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !event.target.closest("[data-search-toggle]")) closePanel(false);
  }, { signal });
  document.addEventListener("keydown", (event) => {
    if (!panel.hidden && event.key === "Escape") { event.preventDefault(); closePanel(); }
  }, { signal });
  document.addEventListener("focusin", (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !event.target.closest("[data-search-toggle]")) closePanel(false);
  }, { signal });
  window.addEventListener("resize", positionPanel, { signal });
}
