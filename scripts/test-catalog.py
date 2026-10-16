"""Проверяет критические сценарии импорта, включая сохранение прежнего снимка."""

import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("sync-catalog.py")
SPEC = importlib.util.spec_from_file_location("catalog_sync", SCRIPT)
SYNC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SYNC)
OFFER = '''<offer id="123" available="true"><name>Кроссовки Ёлка</name>
<price>1990.50</price><oldprice>2990</oldprice><categoryId>1523</categoryId>
<picture>https://outmaxshop.com/photo.jpg</picture><vendor>Test</vendor>
<param name="Размер">36</param><param name="Размер">37</param>
<param name="Размер">36</param><param name="Пол">Детский</param></offer>'''


def feed(offers=OFFER):
    """Оборачивает предложения в минимальную выгрузку с вложенной категорией."""
    return ('''<yml_catalog date="2026-10-16 08:00"><shop><categories>
    <category id="1789">Кроссовки</category>
    <category id="1523" parentId="1789">Детские</category>
    </categories><offers>''' + offers + "</offers></shop></yml_catalog>").encode("utf-8")


class CatalogTests(unittest.TestCase):
    """Проверяет преобразование данных и отказ при ошибочной выгрузке."""

    def test_real_fields_and_nested_category(self):
        result = SYNC.parse_catalog(feed())
        product = result["products"][0]
        self.assertEqual(product["name"], "Кроссовки Ёлка")
        self.assertEqual(product["section"], "Кроссовки")
        self.assertEqual(product["gender"], "Детские")
        self.assertEqual(product["sizes"], ["36", "37"])
        self.assertEqual(product["price"], 1990.5)
        self.assertNotIn("stockBySize", product)

    def test_unavailable_offers_not_imported_or_restored(self):
        unavailable = OFFER.replace('id="123"', 'id="456"').replace('available="true"', 'available="false"')
        result = SYNC.parse_catalog(feed(OFFER + unavailable))
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["unavailableArticles"], ["456"])

    def test_sizes_not_invented(self):
        source = OFFER.replace('<param name="Размер">36</param>', "").replace('<param name="Размер">37</param>', "")
        result = SYNC.parse_catalog(feed(source))
        self.assertEqual(result["products"][0]["sizes"], [])
        self.assertEqual(result["missingSizes"], 1)

    def test_bad_data_rejected(self):
        for source in [
            feed(OFFER + OFFER), feed(OFFER.replace("1990.50", "NaN")),
            feed(OFFER.replace("1990.50", "-1")), feed(""),
            b'<!DOCTYPE x><yml_catalog/>', b'<broken/>',
        ]:
            with self.subTest(source=source[:50]), self.assertRaises(ValueError):
                SYNC.parse_catalog(source)

    def test_failed_import_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = Path(directory) / "catalog.js"
            previous.write_text("previous-valid-catalog", encoding="utf-8")
            broken = Path(directory) / "bad.yml"
            broken.write_text("<broken>", encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), "--feed", str(broken), "--output", str(previous)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(previous.read_text(encoding="utf-8"), "previous-valid-catalog")


if __name__ == "__main__":
    unittest.main()
