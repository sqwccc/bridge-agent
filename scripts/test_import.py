"""SQL 资料是输入数据：验证字面量解析不会执行语句或丢失文本。"""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('importer', Path(__file__).with_name('init-local.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class ImportTest(unittest.TestCase):
    def test_quoted_delimiters_and_null_are_preserved(self):
        self.assertEqual(list(importer.rows("('桥(一),二','O''Brien',NULL,true,-1.25e2);")), [['桥(一),二', "O'Brien", None, 'true', '-1.25e2']])

    def test_expressions_and_extra_statements_are_rejected(self):
        for text in ["(now());", "('a'); DROP TABLE x;", "(1+2);", "('unterminated);"]:
            with self.assertRaises(ValueError):
                list(importer.rows(text))


if __name__ == '__main__':
    unittest.main()
