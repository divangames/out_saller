"""Обновляет статический каталог сайта из YML без сторонних зависимостей."""

import argparse
import json
import math
import os
from pathlib import Path
import tempfile
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

FEED_URL = "https://outmaxshop.com/yml/all.yml"
MAX_FEED_BYTES = 64 * 1024 * 1024
ROOT = Path(__file__).resolve().parent.parent
SECTIONS = {"1789": "Кроссовки", "4": "Одежда"}
GENDERS = {"Мужской": "Мужские", "Женский": "Женские", "Детский": "Детские"}


def text(node, tag):
    """Возвращает очищенное содержимое необязательного XML-элемента."""
    return (node.findtext(tag) or "").strip()


def price(value):
    """Преобразует цену в положительное конечное число."""
    amount = float(value)
    if not math.isfinite(amount) or amount <= 0:
        raise ValueError(f"Некорректная цена: {value!r}")
    return amount


def section_for(category_id, categories):
    """Находит раздел по категории и цепочке её родителей."""
    visited = set()
    while category_id and category_id not in visited:
        if category_id in SECTIONS:
            return SECTIONS[category_id]
        visited.add(category_id)
        category = categories.get(category_id)
        if category is None:
            break
        category_id = category.get("parentId")
    raise ValueError(f"Неизвестная категория: {category_id!r}")


def parse_catalog(source):
    """Проверяет YML и возвращает товары с реальными ценами, фото и размерами."""
    if len(source) > MAX_FEED_BYTES:
        raise ValueError("Выгрузка превышает допустимые 64 МиБ")
    # DTD и сущности не нужны товарной выгрузке и не обрабатываются парсером.
    xml_text = source.decode("utf-8-sig")
    if "<!DOCTYPE" in xml_text.upper() or "<!ENTITY" in xml_text.upper():
        raise ValueError("DTD и XML-сущности запрещены")
    root = ET.fromstring(xml_text)
    if root.tag != "yml_catalog":
        raise ValueError("Ожидался корневой элемент yml_catalog")
    categories = {node.get("id"): node for node in root.findall("shop/categories/category")}
    products = []
    seen = set()
    skipped_unavailable = 0
    unavailable_articles = []
    missing_sizes = 0
    for offer in root.findall("shop/offers/offer"):
        if offer.get("available", "true").lower() == "false":
            skipped_unavailable += 1
            unavailable_articles.append(text(offer, "vendorCode") or offer.get("id", "").strip())
            continue
        article = text(offer, "vendorCode") or offer.get("id", "").strip()
        name = text(offer, "name")
        if not article or not name or article in seen:
            raise ValueError(f"Пустой или повторяющийся артикул/название: {article!r}")
        section = section_for(text(offer, "categoryId"), categories)
        gallery = list(dict.fromkeys(
            (node.text or "").strip() for node in offer.findall("picture")
            if urlsplit((node.text or "").strip()).scheme == "https"
            and not any(char in (node.text or "") for char in '<>"\'\r\n')
        ))
        if not gallery:
            raise ValueError(f"У товара {article} нет HTTPS-фотографий")
        specs = {}
        sizes = []
        for param in offer.findall("param"):
            key, value = param.get("name", "").strip(), (param.text or "").strip()
            if key == "Размер":
                if value and value not in sizes:
                    sizes.append(value)
            elif key and value:
                specs[key] = value
        if not sizes:
            missing_sizes += 1
        amount = price(text(offer, "price"))
        old_price = price(text(offer, "oldprice")) if text(offer, "oldprice") else amount
        products.append({
            "id": article, "article": article, "section": section, "name": name,
            "price": amount, "oldPrice": max(amount, old_price),
            "image": gallery[0], "gallery": gallery,
            "brand": text(offer, "vendor") or "ONE",
            "gender": GENDERS.get(specs.get("Пол"), specs.get("Пол") or "Не указан"),
            "sizes": sizes, "description": text(offer, "description"), "specs": specs,
        })
        seen.add(article)
    if not products:
        raise ValueError("Выгрузка не содержит доступных товаров")
    return {
        "source": FEED_URL, "feedDate": root.get("date", ""),
        "count": len(products), "skippedUnavailable": skipped_unavailable,
        "unavailableArticles": unavailable_articles,
        "missingSizes": missing_sizes, "products": products,
    }


def main():
    """Загружает выгрузку и атомарно заменяет снимок только после проверки."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feed", type=Path, help="Локальный YML вместо загрузки по сети")
    parser.add_argument("--output", type=Path, default=ROOT / "product-catalog.js")
    args = parser.parse_args()
    if args.feed:
        source = args.feed.read_bytes()
    else:
        request = Request(FEED_URL, headers={"User-Agent": "OutmaxCatalogSync/1.0"})
        with urlopen(request, timeout=90) as response:
            source = response.read(MAX_FEED_BYTES + 1)
    catalog = parse_catalog(source)
    payload = "// Товарный снимок; обновление: python scripts/sync-catalog.py\nwindow.OUTMAX_CATALOG = "
    payload += json.dumps(catalog, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + ";\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    staged = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=args.output.parent, delete=False) as file:
            staged = Path(file.name)
            file.write(payload)
        os.replace(staged, args.output)
    finally:
        if staged and staged.exists():
            staged.unlink()
    print(f"Imported {catalog['count']} products; feed: {catalog['feedDate']}; missing sizes: {catalog['missingSizes']}")


if __name__ == "__main__":
    main()
