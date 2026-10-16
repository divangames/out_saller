// Галерея товара: карусель, прокрутка миниатюр и увеличение в модальном окне.
const galleryUi = { events: null, observer: null };
const galleryChevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const galleryMagnify = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6M10 7v6"/></svg>';

/** Возвращает непустой список фотографий товара без повторов. */
function productPhotos(product) {
  return [...new Set((product.gallery?.length ? product.gallery : [product.image]).filter(Boolean))];
}

/** Строит основную и увеличенную карусель в одной системе управления. */
function galleryCarousel(product, enlarged = false) {
  const photos = productPhotos(product);
  const index = Math.max(0, Math.min(state.galleryIndex, photos.length - 1));
  const scope = enlarged ? "enlarged" : "page";
  const arrow = (direction, thumbnails = false) => `<button type="button" class="gallery-arrow ${direction < 0 ? "is-prev" : "is-next"} ${thumbnails ? "thumb-arrow" : "photo-arrow"}" ${thumbnails ? "data-thumbs-step" : "data-photo-step"}="${direction}" aria-label="${thumbnails ? (direction < 0 ? "Прокрутить миниатюры влево" : "Прокрутить миниатюры вправо") : (direction < 0 ? "Предыдущее фото" : "Следующее фото")}" ${thumbnails ? `aria-controls="gallery-thumbs-${scope}"` : ""}>${galleryChevron}</button>`;
  return `<section class="gallery-panel" data-product-gallery="${scope}" aria-label="${enlarged ? "Увеличенные фотографии" : "Фотографии товара"}"><div class="gallery-main"><div class="gallery-stage"><button type="button" class="gallery-image-button" data-photo-zoom aria-label="${enlarged ? "Увеличить фото ещё" : "Увеличить фото"}"><img class="gallery-image" src="${escapeHtml(photos[index])}" alt="${escapeHtml(product.name)}, фото ${index + 1}" ${enlarged ? 'draggable="false"' : ""} /></button></div>${photos.length > 1 ? `${arrow(-1)}${arrow(1)}` : ""}<span class="gallery-counter" role="status" aria-live="polite">${index + 1} / ${photos.length}</span>${enlarged ? "" : `<span class="gallery-zoom-hint" aria-hidden="true">${galleryMagnify}</span>`}</div>${photos.length > 1 ? `<div class="gallery-thumbnails">${arrow(-1, true)}<div class="thumbs" id="gallery-thumbs-${scope}" aria-label="Миниатюры фотографий">${photos.map((src, photoIndex) => `<button type="button" data-photo-index="${photoIndex}" class="${photoIndex === index ? "active" : ""}" aria-label="Показать фото ${photoIndex + 1}" aria-pressed="${photoIndex === index}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></button>`).join("")}</div>${arrow(1, true)}</div>` : ""}</section>`;
}

/** Добавляет большое окно просмотра с собственными стрелками и миниатюрами. */
function productGalleryMarkup(product) {
  return `${galleryCarousel(product)}<dialog class="product-lightbox" id="product-lightbox" aria-labelledby="lightbox-title"><header class="lightbox-header"><h2 id="lightbox-title">${escapeHtml(product.name)}</h2><button type="button" class="lightbox-zoom" aria-label="Увеличить фото ещё" aria-pressed="false">${galleryMagnify}</button><button type="button" class="lightbox-close" aria-label="Закрыть увеличенное фото"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>${galleryCarousel(product, true)}</dialog>`;
}

/** Привязывает галерею, сохраняя фокус, положение страницы и выбранный размер. */
function bindProductGallery() {
  galleryUi.events?.abort();
  galleryUi.observer?.disconnect();
  document.body.classList.remove("product-lightbox-open");
  const roots = [...document.querySelectorAll("[data-product-gallery]")];
  const dialog = document.querySelector("#product-lightbox");
  if (!roots.length || !dialog) return;
  galleryUi.events = new AbortController();
  const { signal } = galleryUi.events;
  const photos = productPhotos(state.selectedProduct);
  const opener = document.querySelector('[data-product-gallery="page"] [data-photo-zoom]');
  const zoomControl = dialog.querySelector(".lightbox-zoom");
  let suppressClickUntil = 0;

  /** Обновляет доступность стрелок по фактическому положению ленты. */
  const updateThumbnailArrows = (root) => {
    const strip = root.querySelector(".thumbs");
    if (!strip) return;
    const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
    root.querySelector('[data-thumbs-step="-1"]').disabled = strip.scrollLeft <= 1;
    root.querySelector('[data-thumbs-step="1"]').disabled = strip.scrollLeft >= max - 1;
  };

  /** Сбрасывает дополнительное увеличение при смене фотографии или закрытии. */
  const resetZoom = () => {
    dialog.classList.remove("is-zoomed");
    zoomControl.setAttribute("aria-pressed", "false");
    zoomControl.setAttribute("aria-label", "Увеличить фото ещё");
    dialog.querySelector("[data-photo-zoom]").setAttribute("aria-label", "Увеличить фото ещё");
    dialog.querySelector(".gallery-stage").scrollTo(0, 0);
  };

  /** Меняет изображение в обеих каруселях без перерисовки карточки товара. */
  const selectPhoto = (requestedIndex) => {
    state.galleryIndex = (requestedIndex + photos.length) % photos.length;
    resetZoom();
    roots.forEach((root) => {
      const image = root.querySelector(".gallery-image");
      image.src = photos[state.galleryIndex];
      image.alt = `${state.selectedProduct.name}, фото ${state.galleryIndex + 1}`;
      root.querySelector(".gallery-counter").textContent = `${state.galleryIndex + 1} / ${photos.length}`;
      root.querySelectorAll("[data-photo-index]").forEach((button) => {
        const active = Number(button.dataset.photoIndex) === state.galleryIndex;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      const strip = root.querySelector(".thumbs");
      const active = strip?.querySelector(".active");
      if (active && strip.clientWidth) {
        const offset = active.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        strip.scrollTo({ left: strip.scrollLeft + offset - (strip.clientWidth - active.offsetWidth) / 2, behavior: "instant" });
      }
      updateThumbnailArrows(root);
    });
  };

  /** Переключает двукратное увеличение с возможностью прокрутки изображения. */
  const toggleZoom = () => {
    const enlarged = dialog.classList.toggle("is-zoomed");
    zoomControl.setAttribute("aria-pressed", String(enlarged));
    const label = enlarged ? "Уменьшить фото" : "Увеличить фото ещё";
    zoomControl.setAttribute("aria-label", label);
    dialog.querySelector("[data-photo-zoom]").setAttribute("aria-label", label);
    const stage = dialog.querySelector(".gallery-stage");
    stage.scrollTo((stage.scrollWidth - stage.clientWidth) / 2, (stage.scrollHeight - stage.clientHeight) / 2);
  };

  roots.forEach((root) => {
    root.addEventListener("click", (event) => {
      if (Date.now() < suppressClickUntil) return;
      const arrow = event.target.closest("[data-photo-step]");
      const thumbnail = event.target.closest("[data-photo-index]");
      const scrollArrow = event.target.closest("[data-thumbs-step]");
      if (arrow) selectPhoto(state.galleryIndex + Number(arrow.dataset.photoStep));
      else if (thumbnail) selectPhoto(Number(thumbnail.dataset.photoIndex));
      else if (scrollArrow) {
        const strip = root.querySelector(".thumbs");
        strip.scrollBy({ left: Number(scrollArrow.dataset.thumbsStep) * strip.clientWidth * .8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      } else if (event.target.closest("[data-photo-zoom]")) {
        if (dialog.open) toggleZoom();
        else {
          dialog.showModal();
          document.body.classList.add("product-lightbox-open");
          selectPhoto(state.galleryIndex);
          dialog.querySelector(".lightbox-close").focus({ preventScroll: true });
        }
      }
    });
    root.querySelector(".thumbs")?.addEventListener("scroll", () => updateThumbnailArrows(root), { passive: true });
    const stage = root.querySelector(".gallery-stage");
    let gesture = null;
    stage.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" && !dialog.classList.contains("is-zoomed")) gesture = { x: event.clientX, y: event.clientY };
    });
    stage.addEventListener("pointercancel", () => { gesture = null; });
    stage.addEventListener("pointerup", (event) => {
      if (!gesture) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        suppressClickUntil = Date.now() + 400;
        selectPhoto(state.galleryIndex + (dx < 0 ? 1 : -1));
      }
    });
  });
  zoomControl.addEventListener("click", toggleZoom);
  dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    resetZoom();
    document.body.classList.remove("product-lightbox-open");
    opener.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open && !event.target.closest("[data-product-gallery]")) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    selectPhoto(event.key === "Home" ? 0 : event.key === "End" ? photos.length - 1 : state.galleryIndex + (event.key === "ArrowRight" ? 1 : -1));
  }, { signal });
  galleryUi.observer = new ResizeObserver(() => roots.forEach(updateThumbnailArrows));
  roots.forEach((root) => { if (root.querySelector(".thumbs")) galleryUi.observer.observe(root.querySelector(".thumbs")); });
  selectPhoto(state.galleryIndex);
}
